local Gameplay = {
  title = "Hot reload me",
  message = "Edit this file, then press Reload in Feather.",
  color = { 1, 1, 0.95 },
  speed = 1.2,
}

function Gameplay.update(state, dt)
  state.time = state.time + dt * Gameplay.speed
  state.pulse = 0.5 + math.sin(state.time * 2.4) * 0.5
end

function Gameplay.draw(state)
  local r, g, b = Gameplay.color[1], Gameplay.color[2], Gameplay.color[3]
  love.graphics.clear(0.08, 0.09, 0.11)
  love.graphics.setColor(r, g, b, 0.35 + state.pulse * 0.35)
  love.graphics.circle("fill", 400, 280, 80 + state.pulse * 32)

  love.graphics.setColor(1, 1, 1)
  love.graphics.setFont(state.font)
  love.graphics.printf(Gameplay.title, 0, 110, 800, "center")

  love.graphics.setFont(state.smallFont)
  love.graphics.printf(Gameplay.message, 0, 390, 800, "center")
end

function Gameplay.__feather_reload(newModule, oldModule)
  if oldModule and oldModule.color then
    print("[Hot Reload] Replaced gameplay module")
  end
  return newModule
end

return Gameplay
