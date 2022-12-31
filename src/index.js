const _const = require("./lib/const");
const script = require(`./lib/${_const.jslibFile}`);

module.exports = {
    find_libpython: () => {
        //spawnsync
        const { spawnSync } = require('child_process');
        const python = spawnSync('python', ['-c', script]);
        //get the output
        if (python.stdout) {
            return python.stdout.toString();
        }
        else {
            throw new Error("Python not found", python.stderr.toString());
        }
    }

};
