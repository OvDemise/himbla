// Asset Row catalogue: the characters (the runner and its gear, people, creatures). Items: see index.js. Three groups, one per
// category, each in a file of its own; the shared helpers are in characters-util.js.
import runner from './characters-runner.js';
import people from './characters-people.js';
import creatures from './characters-creatures.js';

export default [runner, people, creatures];

/*
SKIPPED
- Rusty's loans clerk (casinoWorld.js): the booth has a sign but no figure of its own was found in the code.
- The Spindle's alien drone (spindle.js makeDrone) is in the props catalogue (spindle.drone), not here.
- The road-traffic pedestrians and buggy drivers (traffic.js) and the crowds in the settlements (world.js addFigures) are the same
  makeFigure looks as people.archetypes and people.special; no separate model.
- Dr. Zbornak's workbench and dais (world.js buildLab / settlements.js dressLabInside) belong to the lab building.
*/
