
const fs = require("fs");
const path = require("path");
const _const = require("./const");
async function main() {
    let response = await fetch("https://raw.githubusercontent.com/ktbarrett/find_libpython/master/src/find_libpython/__init__.py");
    if (!response.ok) {
        throw new Error("Failed to fetch python file");
    }
    let data = await response.text();
    data = data.replace(/#.*$/gm, '');
    data = data.replace(/`/gm, '\\`');
    //remove empty lines
    data = data.replace(/^\s*[\r]*$/gm, '');
    //write the string into a file
    fs.writeFileSync(path.join(__dirname, _const.jslibFile), `module.exports=\`${data}\nmain()\``);

    
};
main();