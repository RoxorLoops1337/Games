extends RefCounted

func _ctx() -> Dictionary:
	return {"minute": 50, "my_goals": 0, "opp_goals": 1, "home": true, "my_power": 50, "opp_power": 60,
		"winger": 2, "young": 3, "old": 1, "traits": {"playmaker": 1}}

func run(t: PsT) -> void:
	t.ok(PsCards.CARDS.size() >= 15, "at least 15 cards")
	var ids: Dictionary = {}
	var channels_ok: bool = true
	for c in PsCards.CARDS:
		t.ok(not ids.has(c["id"]), "card id unique: " + str(c["id"]))
		ids[c["id"]] = true
		for r in c["rules"]:
			if not PsCards.CHANNELS.has(r["ch"]):
				channels_ok = false
	t.ok(channels_ok, "every rule targets a real channel")
	t.eq(PsCards.evaluate([], _ctx())["mods"], {"atk": 0, "def": 0, "tmp": 0, "sta": 0}, "no cards, no change")
	var wing: Dictionary = PsCards.evaluate(["wing_overload"], _ctx())
	t.eq(wing["mods"]["atk"], 6, "Wing Overload: 2 wingers give +6")
	t.eq(wing["tag"]["atk"], "Wing Overload", "tag names the helping card")
	var counter: Dictionary = PsCards.evaluate(["counter"], _ctx())
	t.eq(counter["mods"]["atk"], 8, "Counter Attack works while trailing")
	var c2: Dictionary = _ctx()
	c2["my_goals"] = 2
	t.eq(PsCards.evaluate(["counter"], c2)["mods"]["atk"], 0, "Counter Attack is off while leading")
	t.eq(PsCards.evaluate(["iron_wall"], _ctx())["mods"]["def"], 7, "Iron Wall against a stronger side")
	t.eq(PsCards.evaluate(["playmaker"], _ctx())["mods"]["tmp"], 7, "Playmaker with a playmaker in the XI")
	var c3: Dictionary = _ctx()
	c3["traits"] = {}
	t.eq(PsCards.evaluate(["playmaker"], c3)["mods"]["tmp"], 2, "Playmaker without one")
	# Synergy: two attack cards give a bonus; three double it.
	var syn: Array = PsCards.synergies(["golden_boot", "set_pieces"])
	t.eq(syn.size(), 1, "two attack cards give one synergy")
	t.eq(syn[0]["tag"], "attack", "the synergy is attack")
	t.eq(PsCards.synergies(["golden_boot", "set_pieces", "late_surge"])[0]["mult"], 2, "three cards double it")
	t.eq(PsCards.synergies(["golden_boot"]).size(), 0, "one card gives none")
	# Caps hold.
	var everything: Dictionary = PsCards.evaluate(PsCards.all_ids(), _ctx())
	for ch in PsCards.CHANNELS:
		t.ok(int(everything["mods"][ch]) <= PsCards.CAP_HI and int(everything["mods"][ch]) >= PsCards.CAP_LO,
			"all cards together stay inside the cap on " + ch)
	# Offers.
	var rng: PsRng = PsRng.new(3)
	var offer: Array = PsCards.draw_offer(rng, 1, [])
	t.eq(offer.size(), 3, "three cards on offer")
	t.eq(offer.size(), _unique(offer).size(), "no duplicate cards in an offer")
	var rare_seen: bool = false
	for i in 200:
		for id in PsCards.draw_offer(PsRng.new(i), 1, []):
			if int(PsCards.get_card(id)["rarity"]) >= 2:
				rare_seen = true
	t.ok(not rare_seen, "small clubs never see rare cards")
	rare_seen = false
	for i in 200:
		for id in PsCards.draw_offer(PsRng.new(i), 6, []):
			if int(PsCards.get_card(id)["rarity"]) >= 2:
				rare_seen = true
	t.ok(rare_seen, "bigger clubs do see rare cards")
	var owned: Array = PsCards.all_ids().slice(0, 14)
	var small: Array = PsCards.draw_offer(PsRng.new(1), 1, owned)
	t.ok(small.size() <= 3, "offer copes with a nearly empty pool")
	for id in small:
		t.ok(not owned.has(id), "owned cards are never offered")

func _unique(a: Array) -> Array:
	var out: Array = []
	for x in a:
		if not out.has(x):
			out.append(x)
	return out
