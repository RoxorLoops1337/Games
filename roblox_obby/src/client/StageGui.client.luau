--!strict
-- StageGui: a small heads-up display showing the player's current stage and
-- their personal best. Lives in StarterPlayer > StarterPlayerScripts.

local Players = game:GetService("Players")
local player = Players.LocalPlayer

local function waitForStat(name: string): IntValue
	local leaderstats = player:WaitForChild("leaderstats")
	return leaderstats:WaitForChild(name) :: IntValue
end

local stage = waitForStat("Stage")
local best = waitForStat("Best")

local gui = Instance.new("ScreenGui")
gui.Name = "ObbyHud"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.Parent = player:WaitForChild("PlayerGui")

local frame = Instance.new("Frame")
frame.Size = UDim2.new(0, 220, 0, 74)
frame.Position = UDim2.new(0.5, -110, 0, 12)
frame.BackgroundColor3 = Color3.fromRGB(20, 22, 30)
frame.BackgroundTransparency = 0.25
frame.BorderSizePixel = 0
frame.Parent = gui

local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 12)
corner.Parent = frame

local stageLabel = Instance.new("TextLabel")
stageLabel.Size = UDim2.new(1, -16, 0, 42)
stageLabel.Position = UDim2.new(0, 8, 0, 6)
stageLabel.BackgroundTransparency = 1
stageLabel.Font = Enum.Font.GothamBold
stageLabel.TextColor3 = Color3.new(1, 1, 1)
stageLabel.TextScaled = true
stageLabel.Parent = frame

local bestLabel = Instance.new("TextLabel")
bestLabel.Size = UDim2.new(1, -16, 0, 20)
bestLabel.Position = UDim2.new(0, 8, 0, 50)
bestLabel.BackgroundTransparency = 1
bestLabel.Font = Enum.Font.Gotham
bestLabel.TextColor3 = Color3.fromRGB(180, 200, 255)
bestLabel.TextScaled = true
bestLabel.Parent = frame

local function refresh()
	stageLabel.Text = "Stage " .. stage.Value
	bestLabel.Text = "Best: " .. best.Value
end

stage.Changed:Connect(refresh)
best.Changed:Connect(refresh)
refresh()
