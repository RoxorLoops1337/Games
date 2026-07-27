// STUB — owned by the menu/settings agent.
export function createMenu(G, root, cb){
  const el = root.querySelector("#menu");
  const api = {
    show(which){
      el.classList.add("on");
      el.innerHTML = "<div class=panel><h2>BLACKSITE</h2><p class=sub>" +
        (which === "dead" ? "you died" : which === "pause" ? "paused" : "ready") +
        "</p><button id=go>" + (which === "dead" ? "Restart" : "Engage") + "</button>" +
        "<p class=keys><b>WASD</b> move · <b>Shift</b> sprint · <b>Ctrl</b> crouch · " +
        "<b>LMB</b> fire · <b>RMB</b> aim · <b>R</b> reload · <b>Esc</b> pause</p></div>";
      el.querySelector("#go").onclick = () => {
        api.hide();
        if (which === "dead") cb.restart(); else cb.start();
      };
    },
    hide(){ el.classList.remove("on"); },
  };
  return api;
}
