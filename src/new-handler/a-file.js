const {
    input,
    select,
    inputSrc,
    selectMany
} = require('../input')
const util = require('../util')
const fs = require('fs-extra')
const path = require('path')

const langPack = util.loadLanguagePack('file')

const FILE_TYPES = [
    'None',
    '.asp',
    '.bak',
    '.bat',
    '.c',
    '.cpp',
    '.cs',
    '.css',
    '.cshtml',
    '.clj',
    '.coffee',
    '.cnf',
    '.fs',
    '.gitignore',
    '.go',
    '.groovy',
    '.hlsl',
    '.html',
    '.http',
    '.ini',
    '.jade',
    '.java',
    '.js',
    '.json',
    '.jsonc',
    '.jsp',  
    '.less',
    '.log',
    '.lua',
    '.md',
    '.m',
    '.php',
    '.pl',
    '.prl',
    '.perl',
    '.ps1',
    '.properties',
    '.py',
    '.r',
    '.rb',
    '.rs',
    '.scss',
    '.sql',
    '.scala',
    '.sh',
    '.swift',
    '.ts',
    '.txt',
    '.vb',
    '.xml',
    '.xsl',
    '.yml',
]


async function handle({ //工作空间
        sourceDirPath, //当前打开的文件所在目录的路径
        projectDir, //项目目录
        subType, //用户输入的子类型
    },
    comments, //注释相关的信息
    { //配置
        indent //缩进字符串
    }
) {

    //输入源文件路径
    const srcPath = await inputSrc("")
    if (srcPath == undefined) return undefined

    //输入文件名
    let fileName = 'main';
    switch (subType) {
        case '.asp':
            fileName = 'index';
            break;
        case '.bat':
            fileName = 'run';
            break;
        case '.html':
            fileName = 'index';
            break;
        case '.jade':
            fileName = 'index';
            break;
        case '.jsp':
            fileName = 'index';
            break;
        case '.jsp':
            fileName = 'index';
            break;
        case '.less':
            fileName = 'style';
            break;
        case '.md':
            fileName = 'README';
            break;
        case '.php':
            fileName = 'index';
            break;
        case '.sass':
            fileName = 'style';
            break;
        case '.scss':
            fileName = 'style';
            break;
        case '.sql':
            fileName = 'scheme';
            break;
        case '.properties':
            fileName = 'application'
            break;
        case '.yml':
            fileName = 'application'
            break;
        default:
            break;
    }
    if (subType != '.gitignore') {
        fileName = await input(fileName, langPack.inputName)
        if (!fileName) return undefined
    }
    

    let targetPath;
    if (subType == 'None'){
        targetPath = util.pathResolve(projectDir, srcPath, fileName)
    } else {
        targetPath = util.pathResolve(projectDir, srcPath, fileName+subType)
    }
    return {
        targetPath: targetPath,
        code:""
    }
}

module.exports = {
    key: "A File",
    suffix: [],
    subTypes: FILE_TYPES,
    handle: handle
}