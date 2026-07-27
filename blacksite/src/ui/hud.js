// STUB — owned by the HUD agent.
export function createHUD(G, root){
  const magEl = root.querySelector("#ammo .mag");
  const resEl = root.querySelector("#ammo .res");
  const nameEl = root.querySelector("#ammo .name");
  const numEl  = root.querySelector("#health .num");
  const barEl  = root.querySelector("#health .bar i");
  return {
    update(){
      const w = G.weapons.slots[G.weapons.active];
      if (w){ magEl.textContent = w.ammo; resEl.textContent = "/ " + w.res; nameEl.textContent = w.name; }
      numEl.textContent = Math.ceil(G.player.hp);
      barEl.style.transform = "scaleX(" + (G.player.hp/G.player.maxHp) + ")";
      root.classList.toggle("playing", G.mode === "playing");
    },
    handle(){},
  };
}
