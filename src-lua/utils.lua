local function get_current_dir()
  local is_windows = package.config:sub(1, 1) == "\\"
  local cmd = is_windows and "cd" or "pwd"
  local p = io.popen(cmd)
  if not p then
    return ""
  end

  local dir = p:read("*l")
  p:close()

  return dir
end

return {
  get_current_dir = get_current_dir,
}
