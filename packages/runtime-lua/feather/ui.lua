local UI = {}

local function build(kind, props)
  props = props or {}
  local node = { type = kind }
  local children = {}

  for key, value in pairs(props) do
    if type(key) == "number" then
      children[key] = value
    elseif type(value) ~= "function" then
      node[key] = value
    end
  end

  if props.onClick and type(props.onClick) == "string" and not node.action then
    node.action = props.onClick
  end

  if #children > 0 then
    node.children = children
  end

  return node
end

function UI.render(tree, props)
  props = props or {}
  return {
    type = "ui",
    tree = tree,
    loading = props.loading == true,
  }
end

function UI.panel(props)
  return build("panel", props)
end
function UI.row(props)
  return build("row", props)
end
function UI.column(props)
  return build("column", props)
end
function UI.tabs(props)
  return build("tabs", props)
end
function UI.tab(props)
  return build("tab", props)
end
function UI.text(props)
  return build("text", props)
end
function UI.button(props)
  return build("button", props)
end
function UI.input(props)
  return build("input", props)
end
function UI.textarea(props)
  return build("textarea", props)
end
function UI.checkbox(props)
  return build("checkbox", props)
end
function UI.switch(props)
  return build("switch", props)
end
function UI.select(props)
  return build("select", props)
end
function UI.badge(props)
  return build("badge", props)
end
function UI.stat(props)
  return build("stat", props)
end
function UI.progress(props)
  return build("progress", props)
end
function UI.alert(props)
  return build("alert", props)
end
function UI.list(props)
  return build("list", props)
end
function UI.link(props)
  return build("link", props)
end
function UI.separator(props)
  return build("separator", props)
end
function UI.image(props)
  return build("image", props)
end
function UI.code(props)
  return build("code", props)
end
function UI.table(props)
  return build("table", props)
end
function UI.timeline(props)
  return build("timeline", props)
end
function UI.inspector(props)
  return build("inspector", props)
end

return UI
