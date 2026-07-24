--!strict
-- CheckpointService: the "brains" of the obby.
--  * leaderstats: Stage (current) + Best (highest reached, saved across sessions)
--  * touching a checkpoint advances your stage and moves your respawn point
--  * touching a KillBrick kills you (respawn at your last checkpoint)
--  * touching Finish congratulates the player
-- Lives in ServerScriptService.

local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")
local DataStoreService = game:GetService("DataStoreService")
local RunService = game:GetService("RunService")

-- DataStores don't work in local "Play Solo" without API access enabled; guard it.
local store: DataStore? = nil
local ok, result = pcall(function()
	return DataStoreService:GetDataStore("ObbyProgress_v1")
end)
if ok then
	store = result
end

local perPlayerCheckpoints: { [Player]: BasePart } = {}
local finishedThisLife: { [Player]: boolean } = {}

-- ----------------------------------------------------------------------------
-- Find checkpoint pads the generator created.
-- ----------------------------------------------------------------------------
local function getCheckpoint(stage: number): BasePart?
	local folder = Workspace:FindFirstChild("ObbyCourse")
	if not folder then
		return nil
	end
	local checkpoints = folder:FindFirstChild("Checkpoints")
	if not checkpoints then
		return nil
	end
	local pad = checkpoints:FindFirstChild("Checkpoint_" .. stage)
	return (pad and pad:IsA("BasePart")) and pad or nil
end

local function teleportToStage(player: Player, stage: number)
	local pad = getCheckpoint(stage) or getCheckpoint(0)
	local character = player.Character
	if pad and character then
		local root = character:FindFirstChild("HumanoidRootPart")
		if root and root:IsA("BasePart") then
			root.CFrame = pad.CFrame + Vector3.new(0, 4, 0)
		end
		perPlayerCheckpoints[player] = pad
		player.RespawnLocation = pad :: SpawnLocation
	end
end

-- ----------------------------------------------------------------------------
-- Save / load best stage.
-- ----------------------------------------------------------------------------
local function loadBest(player: Player): number
	if not store then
		return 0
	end
	local success, value = pcall(function()
		return store:GetAsync("u_" .. player.UserId)
	end)
	if success and typeof(value) == "number" then
		return value
	end
	return 0
end

local function saveBest(player: Player)
	if not store then
		return
	end
	local best = player:FindFirstChild("leaderstats")
		and player.leaderstats:FindFirstChild("Best")
	if not (best and best:IsA("IntValue")) then
		return
	end
	pcall(function()
		store:SetAsync("u_" .. player.UserId, best.Value)
	end)
end

-- ----------------------------------------------------------------------------
-- Player setup.
-- ----------------------------------------------------------------------------
local function onPlayerAdded(player: Player)
	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"

	local stage = Instance.new("IntValue")
	stage.Name = "Stage"
	stage.Value = 0
	stage.Parent = leaderstats

	local best = Instance.new("IntValue")
	best.Name = "Best"
	best.Value = loadBest(player)
	best.Parent = leaderstats

	leaderstats.Parent = player

	player.CharacterAdded:Connect(function()
		finishedThisLife[player] = nil
		-- Give the character a beat to load, then place at current stage.
		task.wait(0.2)
		teleportToStage(player, stage.Value)
	end)
end

local function onPlayerRemoving(player: Player)
	saveBest(player)
	perPlayerCheckpoints[player] = nil
end

-- ----------------------------------------------------------------------------
-- Touch handling. We poll characters against course parts rather than wiring a
-- Touched event to every brick (simpler, and robust to the generator running
-- after this script).
-- ----------------------------------------------------------------------------
local function partAtFeet(character: Model): BasePart?
	local root = character:FindFirstChild("HumanoidRootPart")
	if not (root and root:IsA("BasePart")) then
		return nil
	end
	local params = OverlapParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { character }
	local region = Workspace:GetPartBoundsInBox(
		root.CFrame - Vector3.new(0, 3, 0),
		Vector3.new(4, 4, 4),
		params
	)
	for _, part in region do
		if part:GetAttribute("Kill") or part:GetAttribute("Finish") then
			return part
		end
		if part.Name:match("^Checkpoint_") then
			return part
		end
	end
	return nil
end

RunService.Heartbeat:Connect(function()
	for _, player in Players:GetPlayers() do
		local character = player.Character
		local leaderstats = player:FindFirstChild("leaderstats")
		if not (character and leaderstats) then
			continue
		end
		local humanoid = character:FindFirstChildOfClass("Humanoid")
		if not humanoid or humanoid.Health <= 0 then
			continue
		end

		local hit = partAtFeet(character)
		if not hit then
			continue
		end

		local stageVal = leaderstats:FindFirstChild("Stage") :: IntValue
		local bestVal = leaderstats:FindFirstChild("Best") :: IntValue

		if hit:GetAttribute("Kill") then
			humanoid.Health = 0
		elseif hit:GetAttribute("Finish") then
			if not finishedThisLife[player] then
				finishedThisLife[player] = true
				stageVal.Value += 1
				if stageVal.Value > bestVal.Value then
					bestVal.Value = stageVal.Value
				end
			end
		elseif hit.Name:match("^Checkpoint_") then
			local stage = hit:GetAttribute("Stage")
			if typeof(stage) == "number" and stage > stageVal.Value then
				stageVal.Value = stage
				if stage > bestVal.Value then
					bestVal.Value = stage
				end
				perPlayerCheckpoints[player] = hit
				player.RespawnLocation = hit :: SpawnLocation
			end
		end
	end
end)

Players.PlayerAdded:Connect(onPlayerAdded)
Players.PlayerRemoving:Connect(onPlayerRemoving)
-- Handle any players already present (e.g. Studio Play Solo).
for _, player in Players:GetPlayers() do
	onPlayerAdded(player)
end

game:BindToClose(function()
	for _, player in Players:GetPlayers() do
		saveBest(player)
	end
end)
