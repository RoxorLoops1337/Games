--!strict
-- ObbyGenerator: builds the whole obstacle course from code at runtime.
-- No manual building needed in Studio — press Play and the course appears.
-- Lives in ServerScriptService.

local Workspace = game:GetService("Workspace")

-- ----------------------------------------------------------------------------
-- Tunables (safe to tweak — this is where the game "feels" get set)
-- ----------------------------------------------------------------------------
local STAGE_COUNT = 20          -- number of checkpoints / stages
local GAP = 6                   -- horizontal gap between platforms (studs)
local PLATFORM_SIZE = Vector3.new(8, 1, 8)
local START_HEIGHT = 20         -- Y position everything is built at
local KILL_COLOR = Color3.fromRGB(196, 40, 28)
local CHECKPOINT_COLOR = Color3.fromRGB(75, 151, 75)

-- Palette cycled per stage so the course reads as sections of colour.
local STAGE_COLORS = {
	Color3.fromRGB(85, 170, 255),
	Color3.fromRGB(255, 176, 66),
	Color3.fromRGB(170, 120, 255),
	Color3.fromRGB(255, 110, 160),
	Color3.fromRGB(120, 220, 170),
}

-- ----------------------------------------------------------------------------
-- Folders to keep the Explorer tidy
-- ----------------------------------------------------------------------------
local course = Instance.new("Folder")
course.Name = "ObbyCourse"
course.Parent = Workspace

local checkpointsFolder = Instance.new("Folder")
checkpointsFolder.Name = "Checkpoints"
checkpointsFolder.Parent = course

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------
local function makePart(size: Vector3, cframe: CFrame, color: Color3, parent: Instance): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.Size = size
	p.CFrame = cframe
	p.Color = color
	p.Material = Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = parent
	return p
end

-- A checkpoint doubles as a SpawnLocation so respawns land the player here.
local function makeCheckpoint(stage: number, position: Vector3): SpawnLocation
	local pad = Instance.new("SpawnLocation")
	pad.Name = "Checkpoint_" .. stage
	pad.Anchored = true
	pad.Size = Vector3.new(10, 1, 10)
	pad.CFrame = CFrame.new(position)
	pad.Color = CHECKPOINT_COLOR
	pad.Material = Enum.Material.Neon
	pad.TopSurface = Enum.SurfaceType.Smooth
	pad.BottomSurface = Enum.SurfaceType.Smooth
	-- Disable auto-spawn on every pad except the first; CheckpointService
	-- decides where each player actually respawns via RespawnLocation.
	pad.Enabled = (stage == 0)
	pad.Neutral = true
	pad.Duration = 0
	pad:SetAttribute("Stage", stage)

	-- A floating stage number so players can see their progress.
	local billboard = Instance.new("BillboardGui")
	billboard.Size = UDim2.new(0, 120, 0, 40)
	billboard.StudsOffset = Vector3.new(0, 4, 0)
	billboard.AlwaysOnTop = true
	billboard.Parent = pad
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Text = (stage == 0) and "START" or ("Stage " .. stage)
	label.TextColor3 = Color3.new(1, 1, 1)
	label.TextStrokeTransparency = 0.4
	label.Font = Enum.Font.GothamBold
	label.TextScaled = true
	label.Parent = billboard

	pad.Parent = checkpointsFolder
	return pad
end

-- ----------------------------------------------------------------------------
-- Obstacle patterns. Each returns the world X where the *next* stretch starts,
-- so obstacles chain together into a single walkable line along +X.
-- ----------------------------------------------------------------------------
local function buildJumps(x: number, y: number, color: Color3, count: number): number
	for _ = 1, count do
		makePart(PLATFORM_SIZE, CFrame.new(x, y, 0), color, course)
		x += PLATFORM_SIZE.X + GAP
	end
	return x
end

-- A row of kill-bricks with safe gaps you must jump between.
local function buildKillGauntlet(x: number, y: number, color: Color3): number
	for i = 1, 4 do
		local isKill = (i % 2 == 0)
		local part = makePart(
			Vector3.new(6, 1, 8),
			CFrame.new(x, y, 0),
			isKill and KILL_COLOR or color,
			course
		)
		if isKill then
			part.Name = "KillBrick"
			part.Material = Enum.Material.Neon
			part:SetAttribute("Kill", true)
		end
		x += 6 + 3
	end
	return x + GAP
end

-- A narrow beam you have to walk across without falling.
local function buildBeam(x: number, y: number, color: Color3): number
	makePart(Vector3.new(24, 1, 2), CFrame.new(x + 12, y, 0), color, course)
	return x + 24 + GAP
end

-- Two step-up platforms so the course climbs a little.
local function buildStairs(x: number, y: number, color: Color3): (number, number)
	makePart(PLATFORM_SIZE, CFrame.new(x, y, 0), color, course)
	x += PLATFORM_SIZE.X + GAP
	makePart(PLATFORM_SIZE, CFrame.new(x, y + 3, 0), color, course)
	x += PLATFORM_SIZE.X + GAP
	return x, y + 3
end

-- ----------------------------------------------------------------------------
-- Build the course, stage by stage.
-- ----------------------------------------------------------------------------
local x = 0
local y = START_HEIGHT

-- Start pad.
makeCheckpoint(0, Vector3.new(x, y, 0))
x += 12

for stage = 1, STAGE_COUNT do
	local color = STAGE_COLORS[((stage - 1) % #STAGE_COLORS) + 1]
	local pattern = stage % 4

	if pattern == 1 then
		x = buildJumps(x, y, color, 3)
	elseif pattern == 2 then
		x = buildKillGauntlet(x, y, color)
	elseif pattern == 3 then
		x = buildBeam(x, y, color)
	else
		x, y = buildStairs(x, y, color)
	end

	-- Drop a checkpoint at the end of each stage.
	makeCheckpoint(stage, Vector3.new(x, y, 0))
	x += 12
end

-- A finish pad past the last checkpoint.
local finish = makePart(Vector3.new(14, 1, 14), CFrame.new(x + 4, y, 0), Color3.fromRGB(255, 215, 0), course)
finish.Name = "Finish"
finish.Material = Enum.Material.Neon
finish:SetAttribute("Finish", true)

local finishGui = Instance.new("BillboardGui")
finishGui.Size = UDim2.new(0, 160, 0, 50)
finishGui.StudsOffset = Vector3.new(0, 5, 0)
finishGui.AlwaysOnTop = true
finishGui.Parent = finish
local finishLabel = Instance.new("TextLabel")
finishLabel.Size = UDim2.fromScale(1, 1)
finishLabel.BackgroundTransparency = 1
finishLabel.Text = "🏆 FINISH"
finishLabel.TextColor3 = Color3.fromRGB(255, 235, 120)
finishLabel.TextStrokeTransparency = 0.3
finishLabel.Font = Enum.Font.GothamBold
finishLabel.TextScaled = true
finishLabel.Parent = finishGui

print(("[Obby] Built %d stages, length ~%d studs."):format(STAGE_COUNT, x))
