files['.luacheckrc'].global = false
std = 'max+busted'
max_line_length = false

globals = {
    'love',
    'getVersion',
    'getTitle',
    'DEBUGGER',
    'FEATHER_PATH',
    'FEATHER_PLUGIN_PATH',
    'FEATHER_AUTO_CONFIG'
}

exclude_files = {
    './lua_install/*',
    './packages/runtime-lua/feather/lib/*',
    "./packages/runtime-lua/demo/lib/*"
}

ignore = {
    '/self',
    '121'
}