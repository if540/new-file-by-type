import { Node } from "./TemplateTree";
import Configuration from "./Configuration";
import I18n from "./I18n";
import * as vscode from 'vscode';
import { TemplateRenderException } from "../util/exception";
import * as os from 'os';
import makeExecutor from "./Executor";

const TPL_PATTERN = /{{([\s\S]*?)}}\n{0,1}/g; // 吞掉1个换行，方便排版
const TPL_ESCAPE = /\\{\\{([\s\S]*?)\\}\\}/g;
const TPL_ONE_PATTERN = /^\s*{{([\s\S]*?)}}\s*$/;
const DECLARATION_ELLIPSIS = /\/\*<\.\.\.>\*\/[\s\S]*?\/\*<\.\.\.\/>\*\//g;

const defaultConf = {
	indent() {
		if (vscode.workspace.getConfiguration('editor').get('insertSpaces')) {
			return vscode.workspace.getConfiguration('editor').get('tabSize');
		}
		return 0;
	},
	user() {
		return os.userInfo().username;
	}
};

export default class TemplateEngine {

	private conf: Configuration;
	private langPack: I18n;
	private executor: ReturnType<typeof makeExecutor>;

	static DEFAULT: TemplateEngine = new TemplateEngine(Configuration.DEFAULT, I18n.DEFAULT);

	finishEnv() {
		// 初始化变量
		this.executor.set("name", this.renderAny(this.conf.name));
		this.executor.set("description", this.renderAny(this.conf.description));
		this.executor.set("version", this.renderAny(this.conf.version));
		this.executor.set("flat", this.renderAny(this.conf.flat));
		this.executor.set("indent", this.renderAny(this.conf.indent));
		this.executor.set("placeHolder", this.renderAny(this.conf.placeHolder));
		this.executor.set("targets", this.renderAny(this.conf.targets));
		this.executor.set("comment", this.conf.comment); // 防止引用
		this.executor.set("date", this.renderAny('{{moment(now).format(comment.dateFormat)}}')); // 设置日期
		this.executor.set("comment", this.renderAny(this.conf.comment));
	}

	initEnv() {
		// 用户语言
		this.executor.set("language", vscode.env.language.toLowerCase());
		// 用户选择编码
		this.executor.set("encoding", vscode.workspace.getConfiguration('files').get('encoding') || 'utf8');
		// 可以使用的默认配置项
		const defaultConfValue: any = {};
		Object.keys(defaultConf).forEach(key => defaultConfValue[key] = (defaultConf as any)[key]());
		this.executor.set("defaultConf", defaultConfValue);
		// 用户打开的文件路径
		const openedFilePaths: string[] = [];
		for (let editor of vscode.window.visibleTextEditors) {
			openedFilePaths.push(editor.document.uri.fsPath);
		}
		this.executor.set("openedFilePaths", openedFilePaths);
		// 设置后缀
		this.executor.set("suffix", this.renderAny(this.conf.suffix));
		//设置用户名
		this.executor.set("user", this.renderAny(this.conf.user));
	}

	constructor(conf: Configuration, langPack: I18n, activeDirectory: string | undefined = undefined) {
		this.conf = conf;
		this.langPack = langPack;
		this.executor = makeExecutor(conf, langPack);
		if (activeDirectory) {
			this.executor.set('useActive', true);
			this.executor.set('activeDirectory', activeDirectory);
		}
		this.initEnv();
	}

	loadDeclaration(source: string) {
		// 删除开发期间需要的文件
		source = source.replace(DECLARATION_ELLIPSIS, '');
		this.executor.exec(source);
	}

	setInputs(value: any) {
		this.executor.set("inputs", value);
	}

	setProjectFolder(value: any) {
		this.executor.set("projectFolder", value);
	}

	setCommentOutput(value: string) {
		this.executor.set("commentOutput", value);
	}

	get(key: string): any {
		return this.executor.exec(`{{${key}}}`);
	}

	private isOnePattern(str: string) {
		const m = str.match(/{{/g); // 只允许存在一个 {{
		return TPL_ONE_PATTERN.test(str) && m !== null && m.length === 1;
	}

	render(str: string): string | any {
		let finished = true;
		if (this.isOnePattern(str)) {
			// 单模式直接返回真实值
			const m = (str.match(TPL_ONE_PATTERN) as string[] )[1];
			const result = this.executor.exec(m);
			if (typeof (result) === "string") {
				return this.render(result);
			}
			return result;
		}
		let result = str.replace(TPL_PATTERN, (g0, g1) => {
			finished = false;
			return this.executor.exec(g1);
		});
		if (finished) {
			return result;
		}
		result = this.render(result);
		// 转义\{\{\}\}
		return result.replace(TPL_ESCAPE, '{{$1}}');
	}

	renderAny<T>(value: T): T {
		let result: any;
		if (typeof (value) === "string") {
			result = this.render(value);
		} else if (typeof (value) === "object") {
			if ((value as any).constructor === Array) {
				result = this.renderArray(value as any);
			} else if ((value as any).constructor === Object) {
				result = this.renderObject(value);
			}
		} else {
			result = value;
		}
		return result;
	}

	renderArray<T extends Array<T>>(arr: T): Array<T> {
		const result: Array<any> = [];
		for (let value of arr) {
			result.push(this.renderAny(value));
		}
		return result;
	}

	renderObject<T extends {[key: string]: any}>(obj: T): T {
		const result:any = {};
		for (let key in obj) {
			const value = obj[key];
			result[key] = this.renderAny(value);
		}
		return result;
	}
}
