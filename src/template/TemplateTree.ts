import Configuration, { Target, InputItem } from "./Configuration";
import * as path from "path";
import fs from "../util/fs";
import I18n from "./I18n";
import * as globby from "globby";
import TemplateEngine from "./TemplateEngine";

const CONFIG_FILENAME = "config.json";
const I18N_PATH = "i18n";

export interface OutputItem {
	isDirectory?: boolean; // 默认是文件
	targetPath: string;
	originPath?: string;
	exists: boolean;
	content?: string | Buffer; // TODO Buffer类型，考虑null和大文件，文件拷贝优化和设置进度条
}

export class Node {
	public children: Node[];
	public namespace: string;
	public parent?: Node;
	public readonly path: string;
	public configuration: Configuration;
	public langPack: I18n;
	public engine: TemplateEngine;
	public constructor(nodePath: string, parent?: Node) {
		this.path = nodePath;
		this.parent = parent;
		this.namespace = "";
		this.children = [];
		this.configuration = Configuration.DEFAULT;
		this.langPack = I18n.DEFAULT;
		this.engine = TemplateEngine.DEFAULT;
	}
	public static async buildTree(nodePath: string, parent?: Node): Promise<Node> {
		// 构建树并设置父子关系
		const now = new Node(nodePath, parent);
		if (parent) {
			parent.children.push(now);
		}
		// 名字空间
		if (parent) {
			if (parent.namespace === '') {
				now.namespace = path.basename(nodePath);
			} else {
				now.namespace = parent.namespace + '.' + path.basename(nodePath);
			}
		}
		// 加载配置
		await now.loadConfig();
		// 加载i18n语言包
		await now.loadI18n();
		// 设置模板引擎
		now.engine = new TemplateEngine(now.configuration, now.langPack);
		// 加载子树
		if ((await fs.statAsync(nodePath)).isDirectory()) {
			for (let subName of (await fs.readdirAsync(nodePath))) {
				const subPath = path.resolve(nodePath, subName);
				if (subName !== 'i18n' && (await fs.statAsync(subPath)).isDirectory()) {
					await this.buildTree(subPath, now);
				}
			}
		}
		// 对子树进行排序
		now.children.sort((a, b) => {
			if (a.weight !== b.weight) {
				return a.weight - b.weight;
			}
			if (a.name < b.name) {
				return -1;
			} else if (a.name > b.name) {
				return 1;
			}
			return 0;
		});
		return now;
	}
	updateEngine(activeDirectory: string | undefined = undefined) {
		this.engine = new TemplateEngine(this.configuration, this.langPack, activeDirectory);
	}
	private async loadConfig() {
		this.configuration = await Configuration.load(
			path.resolve(this.path, CONFIG_FILENAME),
			this.namespace,
			this.parent ? this.parent.configuration : undefined);
	}
	private async loadI18n() {
		this.langPack = await I18n.load(
			path.resolve(this.path, I18N_PATH),
			this.parent ? this.parent.langPack : undefined);
	}
	public isLeaf() {
		return this.children.length === 0;
	}
	public async match(projectFolders?: string[]) {
		if (!projectFolders) {
			return [];
		}
		const matchConf = this.configuration.match;
		if (matchConf.always) {
			return true;
		}
		if (matchConf.workspaceFolderGlobs) {
			for (let projectFolder of projectFolders) {
				if ((await globby(matchConf.workspaceFolderGlobs, { cwd: projectFolder })).length !== 0 ) {
					return true;
				}
			}
		}
		return false;
	}

	get name(): string {
		return this.engine.render(this.configuration.name);
	}

	get description(): string | undefined {
		try {
			return this.engine.render(this.configuration.description);
		} catch (error) {
			if ((error.message as string).startsWith('i18n Error')) {
				return undefined;
			}
			throw error;
		}
	}

	get weight(): number {
		return this.engine.renderAny(this.configuration.weight);
	}

	get flat(): boolean {
		return this.configuration.flat;
	}

	getInput(idx: number) {
		let input = this.configuration.inputs[idx];
		const after = input.after;
		delete input.after;
		input = this.engine.renderObject(input);
		input.after = after;
		return input;
	}

	get inputsLength() {
		return this.configuration.inputs.length;
	}
	
	public step(no: number) {
		return this.engine.render(`{{i18n('step')}}${no}{{i18n(':')}}`);
	}

	private operateTips() {
		return this.engine.render(`{{i18n('operateTips')}}`);
	}

	public withStepAndOperateTips(no: number, content: string) {
		return this.step(no) + content + this.operateTips();
	}

	placeHolder(no: number): string {
		return this.withStepAndOperateTips(no, this.engine.render(this.configuration.placeHolder));
	}

	public i18n(key: string): string {
		return this.engine.render(`{{i18n('${key}')}}`);
	}

	setProjectFolder(projectFolder: string) {
		this.engine.setProjectFolder(projectFolder);
	}
	
	setInputs(inputs: any, originInput: InputItem) {
		this.engine.setInputs(inputs);
		if (originInput.after) {
			this.engine.render(originInput.after);
		}
	}

	get showHidden(): boolean {
		return this.configuration.showHidden;
	}

	get commentOutput() {
		const comment = this.configuration.comment;
		return [
			comment.startLine || '',
			...comment.items.map(item => comment.lineHeader + this.engine.render(item)),
			comment.endLine || ''
		].join('\n');
	}

	setCommentOutput(commentOutput: string) {
		this.engine.setCommentOutput(commentOutput);
	}

	public async renderTpl(): Promise<OutputItem[]>{
		// 最终完成模板引擎环境设置
		this.engine.finishEnv();
		// 渲染并设置注释
		this.setCommentOutput(this.commentOutput);
		const result = [] as OutputItem[];
		for (let target of (this.engine.get('targets') as Target[]) ) {
			let tpl = (await fs.readFileAsync(path.resolve(this.path, target.tplpath))).toString('utf8'); // TODO 添加异常提示
			let indent = this.configuration.indent;
			if (indent !== 0) {
				tpl = tpl.replace(/\t/g, new Array(indent).fill(' ').join('') );
			}
			let content = this.engine.render(tpl);
			result.push({
				exists: await fs.existsAsync(target.filepath),
				content: content,
				targetPath: target.filepath
			});
		}
		return result;
	}

}

export default class TemplateTree {

	private path: string;
	private tree?: Node;

	private constructor(path: string) {
		this.path = path;
	}

	get root(): Node {
		return this.tree as Node;
	}

	public static async build(path: string) {
		const instance = new TemplateTree(path);
		if (await fs.existsAsync(path) && (await fs.statAsync(path)).isDirectory()) {
			instance.tree = await Node.buildTree(path);
		} else {
			throw new Error('Template dir not exists or not directory');
		}
		return instance;
	}

	public findLeafNodeByPath(paths: string[]): Node[] {
		const result: Node[] = [];
		this.traverse((node): null => {
			if (node.isLeaf() && paths.indexOf(node.path)!== -1) {
				result.push(node);
			}
			return null;
		});
		return result;
	}

	public async matchNodeChildren(projectFolders?: string[], node?: Node): Promise<Node[]> {
		const result: Node[] = [];
		node = node || this.tree;
		if (!node) {
			return result;
		}
		for (let sub of node.children) {
			if (await sub.match(projectFolders)) {
				if (node.flat === false || sub.isLeaf()) {
					result.push(sub);
				} else {
					result.push(... await this.matchNodeChildren(projectFolders, sub));
				}
			}
		}
		return result;
	}

	public traverse<T>(func: (node: Node) => T, node ?: Node | null ): T | null {
		if (this.tree === undefined) {
			return null;
		}
		if (node === null) {
			return null;
		}
		if (node === undefined) {
			return this.traverse(func, this.tree);
		}
		const result = func(node);
		if (result !== null) {
			return result;
		}
		for (let sub of node.children) {
			const result = this.traverse(func, sub);
			if (result !== null) {
				return result;
			}
		}
		return null;
	}
	
	i18n(key: string):string {
		return this.root.i18n(key);
	}

	withStepAndOperateTips(no: number, content: string) {
		return this.root.withStepAndOperateTips(no, content);
	}
}