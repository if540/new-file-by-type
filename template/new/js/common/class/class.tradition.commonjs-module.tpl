{{commentOutput}}
{{
	declaration.nodeImports(targets[0].filepath, inputs.imports, (name, relative) => `const ${name} = require('${relative}')`)
}}


function {{inputs.className}}($1) {
	$2
}

{{inputs.className}}.prototype.${3:method} = function ($4) {
	${0:{{happyCoding}}}
};

module.exports = {{inputs.className}};