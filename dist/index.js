'use strict';

var require$$1 = require('child_process');

var lib_python;
var hasRequiredLib_python;

function requireLib_python () {
	if (hasRequiredLib_python) return lib_python;
	hasRequiredLib_python = 1;
	lib_python=`"""
Locate libpython associated with this Python executable.
"""

from logging import getLogger as _getLogger
from sysconfig import get_config_var as _get_config_var
from ctypes.util import find_library as _find_library
import ctypes
import os
import sys

from find_libpython._version import version as __version__  

_logger = _getLogger("find_libpython")

_is_apple = sys.platform == "darwin"
_is_msys = sys.platform == "msys"
_is_mingw = sys.platform == "mingw"
_is_windows = os.name == "nt" and not _is_mingw and not _is_msys
_is_posix = os.name == "posix"

_SHLIB_SUFFIX = _get_config_var("_SHLIB_SUFFIX")
if _SHLIB_SUFFIX is None:
    if _is_windows:
        _SHLIB_SUFFIX = ".dll"
    else:
        _SHLIB_SUFFIX = ".so"
if _is_apple:

    _SHLIB_SUFFIX = ".dylib"

def _linked_libpython_unix(libpython):
    if not hasattr(libpython, "Py_GetVersion"):
        return None

    class Dl_info(ctypes.Structure):
        _fields_ = [
            ("dli_fname", ctypes.c_char_p),
            ("dli_fbase", ctypes.c_void_p),
            ("dli_sname", ctypes.c_char_p),
            ("dli_saddr", ctypes.c_void_p),
        ]

    libdl = ctypes.CDLL(_find_library("dl"))
    libdl.dladdr.argtypes = [ctypes.c_void_p, ctypes.POINTER(Dl_info)]
    libdl.dladdr.restype = ctypes.c_int

    dlinfo = Dl_info()
    retcode = libdl.dladdr(
        ctypes.cast(libpython.Py_GetVersion, ctypes.c_void_p),
        ctypes.pointer(dlinfo),
    )
    if retcode == 0:  
        return None
    return os.path.realpath(dlinfo.dli_fname.decode())

def _library_name(name, suffix=_SHLIB_SUFFIX, _is_windows=_is_windows):
    """
    Convert a file basename \`name\` to a library name (no "lib" and ".so" etc.)

    >>> _library_name("libpython3.7m.so")                   
    'python3.7m'
    >>> _library_name("libpython3.7m.so", suffix=".so", _is_windows=False)
    'python3.7m'
    >>> _library_name("libpython3.7m.dylib", suffix=".dylib", _is_windows=False)
    'python3.7m'
    >>> _library_name("python37.dll", suffix=".dll", _is_windows=True)
    'python37'
    """
    if not _is_windows and name.startswith("lib"):
        name = name[len("lib") :]
    if suffix and name.endswith(suffix):
        name = name[: -len(suffix)]
    return name

def _append_truthy(list, item):
    if item:
        list.append(item)

def _uniquifying(items):
    """
    Yield items while excluding the duplicates and preserving the order.

    >>> list(_uniquifying([1, 2, 1, 2, 3]))
    [1, 2, 3]
    """
    seen = set()
    for x in items:
        if x not in seen:
            yield x
        seen.add(x)

def _uniquified(func):
    """Wrap iterator returned from \`func\` by \`_uniquifying\`."""
    from functools import wraps

    @wraps(func)
    def wrapper(*args, **kwds):
        return _uniquifying(func(*args, **kwds))

    return wrapper

@_uniquified
def candidate_names(suffix=_SHLIB_SUFFIX):
    """
    Iterate over candidate file names of libpython.

    Yields
    ------
    name : str
        Candidate name libpython.
    """

    INSTSONAME = _get_config_var("INSTSONAME")
    if INSTSONAME and suffix in INSTSONAME:
        yield INSTSONAME

    LDLIBRARY = _get_config_var("LDLIBRARY")
    if LDLIBRARY and os.path.splitext(LDLIBRARY)[1] == suffix:
        yield LDLIBRARY

    LIBRARY = _get_config_var("LIBRARY")
    if LIBRARY and os.path.splitext(LIBRARY)[1] == suffix:
        yield LIBRARY

    DLLLIBRARY = _get_config_var("DLLLIBRARY")
    if DLLLIBRARY:
        yield DLLLIBRARY

    if _is_mingw:
        dlprefix = "lib"
    elif _is_windows or _is_msys:
        dlprefix = ""
    else:
        dlprefix = "lib"

    sysdata = dict(
        v=sys.version_info,

        VERSION=(
            _get_config_var("VERSION")
            or "{v.major}.{v.minor}".format(v=sys.version_info)
        ),
        ABIFLAGS=(_get_config_var("ABIFLAGS") or _get_config_var("abiflags") or ""),
    )

    for stem in [
        "python{VERSION}{ABIFLAGS}".format(**sysdata),
        "python{VERSION}".format(**sysdata),
    ]:
        yield dlprefix + stem + suffix

def _linked_pythondll() -> str:

    dll_hmodule = ctypes.cast(sys.dllhandle, ctypes.c_void_p)

    path_return_buffer = ctypes.create_unicode_buffer(32768)

    r = ctypes.windll.kernel32.GetModuleFileNameW(
        dll_hmodule, path_return_buffer, len(path_return_buffer)
    )

    if r == len(path_return_buffer):
        return None

    return path_return_buffer.value

@_uniquified
def candidate_paths(suffix=_SHLIB_SUFFIX):
    """
    Iterate over candidate paths of libpython.

    Yields
    ------
    path : str or None
        Candidate path to libpython.  The path may not be a fullpath
        and may not exist.
    """

    if _is_windows:
        yield _linked_pythondll()

    lib_dirs = []
    _append_truthy(lib_dirs, _get_config_var("LIBPL"))
    _append_truthy(lib_dirs, _get_config_var("srcdir"))
    _append_truthy(lib_dirs, _get_config_var("LIBDIR"))

    if _is_windows or _is_msys or _is_mingw:
        lib_dirs.append(os.path.join(os.path.dirname(sys.executable)))
    else:
        lib_dirs.append(
            os.path.join(os.path.dirname(os.path.dirname(sys.executable)), "lib")
        )

    _append_truthy(lib_dirs, _get_config_var("PYTHONFRAMEWORKPREFIX"))

    lib_dirs.append(sys.exec_prefix)
    lib_dirs.append(os.path.join(sys.exec_prefix, "lib"))

    lib_basenames = list(candidate_names(suffix=suffix))

    if _is_posix and not _is_msys:
        for basename in lib_basenames:
            try:
                libpython = ctypes.CDLL(basename)
            except OSError:
                pass
            else:
                yield _linked_libpython_unix(libpython)

    for directory in lib_dirs:
        for basename in lib_basenames:
            yield os.path.join(directory, basename)

    for basename in lib_basenames:
        yield _find_library(_library_name(basename))

def _normalize_path(path, suffix=_SHLIB_SUFFIX, _is_apple=_is_apple):
    """
    Normalize shared library \`path\` to a real path.

    If \`path\` is not a full path, \`None\` is returned.  If \`path\` does
    not exists, append \`_SHLIB_SUFFIX\` and check if it exists.
    Finally, the path is canonicalized by following the symlinks.

    Parameters
    ----------
    path : str ot None
        A candidate path to a shared library.
    """
    if not path:
        return None
    if not os.path.isabs(path):
        return None
    if os.path.exists(path):
        return os.path.realpath(path)
    if os.path.exists(path + suffix):
        return os.path.realpath(path + suffix)
    if _is_apple:
        return _normalize_path(
            _remove_suffix_apple(path), suffix=".so", _is_apple=False
        )
    return None

def _remove_suffix_apple(path):
    """
    Strip off .so or .dylib.

    >>> _remove_suffix_apple("libpython.so")
    'libpython'
    >>> _remove_suffix_apple("libpython.dylib")
    'libpython'
    >>> _remove_suffix_apple("libpython3.7")
    'libpython3.7'
    """
    if path.endswith(".dylib"):
        return path[: -len(".dylib")]
    if path.endswith(".so"):
        return path[: -len(".so")]
    return path

@_uniquified
def _finding_libpython():
    """
    Iterate over existing libpython paths.

    The first item is likely to be the best one.

    Yields
    ------
    path : str
        Existing path to a libpython.
    """
    _logger.debug("_is_windows = %s", _is_windows)
    _logger.debug("_is_apple = %s", _is_apple)
    _logger.debug("_is_mingw = %s", _is_mingw)
    _logger.debug("_is_msys = %s", _is_msys)
    _logger.debug("_is_posix = %s", _is_posix)
    for path in candidate_paths():
        _logger.debug("Candidate: %s", path)
        normalized = _normalize_path(path)
        if normalized:
            _logger.debug("Found: %s", normalized)
            yield normalized
        else:
            _logger.debug("Not found.")

def find_libpython():
    """
    Return a path (\`str\`) to libpython or \`None\` if not found.

    Parameters
    ----------
    path : str or None
        Existing path to the (supposedly) correct libpython.
    """
    for path in _finding_libpython():
        return os.path.realpath(path)

def _print_all(items):
    for x in items:
        print(x)

def _cli_find_libpython(cli_op, verbose):
    import logging

    if verbose:
        logging.basicConfig(format="%(levelname)s %(message)s", level=logging.DEBUG)

    if cli_op == "list-all":
        _print_all(_finding_libpython())
    elif cli_op == "candidate-names":
        _print_all(candidate_names())
    elif cli_op == "candidate-paths":
        _print_all(p for p in candidate_paths() if p and os.path.isabs(p))
    else:
        path = find_libpython()
        if path is None:
            return 1
        print(path, end="")

def main(args=None):
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Print debugging information."
    )

    parser.add_argument(
        "--version", action="version", version="find_libpython {}".format(__version__)
    )

    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--list-all",
        action="store_const",
        dest="cli_op",
        const="list-all",
        help="Print list of all paths found.",
    )
    group.add_argument(
        "--candidate-names",
        action="store_const",
        dest="cli_op",
        const="candidate-names",
        help="Print list of candidate names of libpython.",
    )
    group.add_argument(
        "--candidate-paths",
        action="store_const",
        dest="cli_op",
        const="candidate-paths",
        help="Print list of candidate paths of libpython.",
    )

    ns = parser.parse_args(args)
    parser.exit(_cli_find_libpython(**vars(ns)))

main()`;
	return lib_python;
}

var dynamicModules;

function getDynamicModules() {
	return dynamicModules || (dynamicModules = {
		"/src/lib/lib_python.js": requireLib_python
	});
}

function createCommonjsRequire(originalModuleDir) {
	function handleRequire(path) {
		var resolvedPath = commonjsResolve(path, originalModuleDir);
		if (resolvedPath !== null) {
			return getDynamicModules()[resolvedPath]();
		}
		throw new Error('Could not dynamically require "' + path + '". Please configure the dynamicRequireTargets or/and ignoreDynamicRequires option of @rollup/plugin-commonjs appropriately for this require call to work.');
	}
	handleRequire.resolve = function (path) {
		var resolvedPath = commonjsResolve(path, originalModuleDir);
		if (resolvedPath !== null) {
			return resolvedPath;
		}
		return require.resolve(path);
	};
	return handleRequire;
}

function commonjsResolve (path, originalModuleDir) {
	var shouldTryNodeModules = isPossibleNodeModulesPath(path);
	path = normalize(path);
	var relPath;
	if (path[0] === '/') {
		originalModuleDir = '';
	}
	var modules = getDynamicModules();
	var checkedExtensions = ['', '.js', '.json'];
	while (true) {
		if (!shouldTryNodeModules) {
			relPath = normalize(originalModuleDir + '/' + path);
		} else {
			relPath = normalize(originalModuleDir + '/node_modules/' + path);
		}

		if (relPath.endsWith('/..')) {
			break; // Travelled too far up, avoid infinite loop
		}

		for (var extensionIndex = 0; extensionIndex < checkedExtensions.length; extensionIndex++) {
			var resolvedPath = relPath + checkedExtensions[extensionIndex];
			if (modules[resolvedPath]) {
				return resolvedPath;
			}
		}
		if (!shouldTryNodeModules) break;
		var nextDir = normalize(originalModuleDir + '/..');
		if (nextDir === originalModuleDir) break;
		originalModuleDir = nextDir;
	}
	return null;
}

function isPossibleNodeModulesPath (modulePath) {
	var c0 = modulePath[0];
	if (c0 === '/' || c0 === '\\') return false;
	var c1 = modulePath[1], c2 = modulePath[2];
	if ((c0 === '.' && (!c1 || c1 === '/' || c1 === '\\')) ||
		(c0 === '.' && c1 === '.' && (!c2 || c2 === '/' || c2 === '\\'))) return false;
	if (c1 === ':' && (c2 === '/' || c2 === '\\')) return false;
	return true;
}

function normalize (path) {
	path = path.replace(/\\/g, '/');
	var parts = path.split('/');
	var slashed = parts[0] === '';
	for (var i = 1; i < parts.length; i++) {
		if (parts[i] === '.' || parts[i] === '') {
			parts.splice(i--, 1);
		}
	}
	for (var i = 1; i < parts.length; i++) {
		if (parts[i] !== '..') continue;
		if (i > 0 && parts[i - 1] !== '..' && parts[i - 1] !== '.') {
			parts.splice(--i, 2);
			i--;
		}
	}
	path = parts.join('/');
	if (slashed && path[0] !== '/') path = '/' + path;
	else if (path.length === 0) path = '.';
	return path;
}

var _const$1= Object.freeze({
    jslibFile:"lib_python.js",
});

const _const = _const$1;
const script = createCommonjsRequire("/src")(`./lib/${_const.jslibFile}`);

var src = {
    find_libpython: () => {
        //spawnsync
        const { spawnSync } = require$$1;
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

module.exports = src;
