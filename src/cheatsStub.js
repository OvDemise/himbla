// What game.cheats is in a release build (devtools.js): the same fields at their normal values and every method a no-op,
// so the rest of the game reads `cheats.speed`, `cheats.god` ... and calls `cheats.tick()` without knowing the dev menu is
// gone. Keep it in step with cheats.js: `npm run check:dev-strip` fails if the game uses a member this class lacks.
export class Cheats {
  constructor(game) {
    this.game = game;
    this.god = false;
    this.infJet = false;
    this.mapTeleport = false;
    this.aiPaths = false;
    this.debugView = null;
    this.ragdoll = true;
    this.crackedVisor = true;
    this.speed = 1;
    this.unlocked = false;
    this.meteorPower = false;
  }

  showPauseButton() {}
  dev() {}
  open() {}
  tick() {}
  frameStart() {}
  updateInputMon() {}
  beforeRender() {}
  renderStart() {}
  renderDebug() {}
  renderEnd() {}
  drawStats() {}
  alertNote() {}
  spawnMeteor() { return false; }
  teleport() {}
}
