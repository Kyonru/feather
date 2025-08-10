files['.luacheckrc'].global = false
std = 'max+busted'
max_line_length = false

globals = {
    'love',
    'getVersion',
    'getTitle'
}

exclude_files = {
    './lua_install/*',
    './src-lua/feather/lib/*'
}

ignore = {
    '/self',
    '121'
}