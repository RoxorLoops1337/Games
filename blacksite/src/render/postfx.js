// STUB — owned by the post-processing agent.
export function createPostFX(G, engine){
  return {
    render(){
      const r = engine.renderer;
      r.setRenderTarget(null); r.clear();
      r.render(engine.scene, engine.camera);
      r.autoClear = false; r.clearDepth();
      r.render(engine.view, engine.viewCam);
      r.autoClear = true;
    },
    resize(){}, setQuality(){}, update(){},
  };
}
