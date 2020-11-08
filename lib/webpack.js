const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const { transformFromAst } = require("@babel/core");
//@babel/preset-env

module.exports = class Webpack {
  constructor(options) {
    // options 为 webpack.config.js 中的配置
    // 从 options 中解构出 entry、output
  	const { entry, output } = options;
    // 入口
    this.entry = entry;
    // 出口
    this.output = output;
    // 模块
    this.modules = [];
  }

  // 构建启动函数
  run() {
    // 解析入口模块
    const info = this.parse(this.entry);
    this.modules.push(info);

    // 递归解析所有依赖
    this.recursionDependent()

    // 数组结构转对象结构
    const graphMap = this.generateDependencyGraph()

    // 生成输出文件
    this.generate(graphMap);
  }

  // 解析所有依赖模块
  recursionDependent() {
    // 递归解析所有依赖模块
    for (let i = 0; i < this.modules.length; i++) {
      const item = this.modules[i];
      const dependencies = item.dependencies;
      // 判断是否有依赖对象，递归解析所有的依赖模块
      if (dependencies) {
        for(let j in dependencies) {
          this.modules.push(this.parse(dependencies[j]))
        }
      }
    }
  }

  // 生成依赖关系图
  generateDependencyGraph() {
    const graphMap = {}
    this.modules.forEach(item => {
      graphMap[item.entryFile] = {
        dependencies: item.dependencies,
        code: item.code
      }
    })
    return graphMap
  }

  // 转换成 AST 语法树
  getAst(entryFile) {
    // 分析入口模块的内容
    const content = fs.readFileSync(entryFile, "utf-8");

    // 将入口文件的内容转换为 AST 抽象语法树
    const ast = parser.parse(content, {
      sourceType: "module",
    });

    return ast
  }

  // 获取所有引用依赖
  getDependencies(ast, entryFile) {
    const dependencies = {};
    // 遍历所有的 import 模块，存入 dependencies 中
    traverse(ast, {
      // 类型为 ImportDeclaration 的 AST 节点（即 import 语句）
      ImportDeclaration({ node }) {
        // 保存依赖模块路径，在后面生层依赖关系图时会用到
        const pathName = './' + path.join(path.dirname(entryFile), node.source.value);
        dependencies[node.source.value] = pathName;
      }
    })
    return dependencies
  }

  // 将 AST 转换成 浏览器可以运行的代码
  getCode(ast) {
    const { code } = transformFromAst(ast, null, {
      presets: ["@babel/preset-env"]
    })
    return code;
  }

  // 解析依赖模块
  parse(entryFile) {

    // 获取 AST 抽象语法树
    const ast = this.getAst(entryFile);

    // 获取所有引用依赖
    const dependencies = this.getDependencies(ast, entryFile)

    // 将 AST 转换成浏览器可运行的代码
    const code = this.getCode(ast)
    return {
      entryFile,
      dependencies,
      code,
    };
  }

  // 重写 require 函数，输出 bundle
  generate(code) {
    // 生成代码内容 webpack启动函数
    const filePath = path.join(this.output.path, this.output.filename);
    const newCode = JSON.stringify(code);
    const bundle = `(function(graph){
        function require(module){
            function PathRequire(relativePath){
               return require(graph[module].dependencies[relativePath])
            }
            const exports = {};
            (function(require,exports,code){
               eval(code) 
            })(PathRequire,exports,graph[module].code)
            return exports;
        }
        require('${this.entry}')
    })(${newCode})`;
    // 生成main.js 位置是./dist目录
    fs.writeFileSync(filePath, bundle, "utf-8");
  }
};
