# find-libpython


This is a project inspired from [ktbarrett/find_libpython](https://github.com/ktbarrett/find_libpython)'s python package
Actually, it directly uses the same python code. Project has built by fetching `find_libpython` raw code and execute as python subprocess
So, `python` is required

## Install and Use
```
npm i find-libpython
```

```javascript
const {find_libpython} = require("find-libpython")
const libPath = find_libpython()

console.log(libPath)

//outputs: /usr/lib/libpython3.10.so.1.0
//depending on the python version

```