import { Application, Text, TextStyle } from 'pixi.js';

const BACKGROUND_COLOR = 0x1f6f43;

export interface BootstrapResult {
  app: Application;
  destroy: () => void;
}

export async function bootstrap(container: HTMLElement): Promise<BootstrapResult> {
  const app = new Application();

  await app.init({
    background: BACKGROUND_COLOR,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
    resizeTo: container,
  });

  container.appendChild(app.canvas);

  const title = new Text({
    text: 'Hello Park',
    style: new TextStyle({
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      fontSize: 64,
      fontWeight: 'bold',
      fill: 0xffffff,
      stroke: { color: 0x000000, width: 4 },
    }),
  });

  title.anchor.set(0.5);
  title.x = app.screen.width / 2;
  title.y = app.screen.height / 2;
  app.stage.addChild(title);

  const recenter = (): void => {
    title.x = app.screen.width / 2;
    title.y = app.screen.height / 2;
  };

  app.renderer.on('resize', recenter);

  const destroy = (): void => {
    app.renderer.off('resize', recenter);
    app.destroy(true, { children: true, texture: true });
  };

  return { app, destroy };
}
