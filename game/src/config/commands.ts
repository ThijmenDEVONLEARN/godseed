/** Every chat command: feeds both the parser and the on-screen command panel, so they never drift apart. */
export const COMMANDS = [
  { usage: '!join red', help: 'get your own villager (red, blue, yellow or green)', free: true },
  { usage: '!build hut', help: 'build hut, farm, wall, tower, smithy, temple or bridge' },
  { usage: '!attack blue', help: 'attack another tribe' },
  { usage: '!attack @name', help: 'hunt down one player' },
  { usage: '!chop', help: 'cut wood' },
  { usage: '!mine', help: 'mine stone, iron or gold' },
  { usage: '!farm', help: 'grow food' },
  { usage: '!defend', help: 'guard your village' },
  { usage: '!march', help: 'march to the centre and hold it' },
  { usage: '!burn', help: 'set an enemy building on fire' },
  { usage: '!pray', help: 'pray at the temple for faith' },
  { usage: '!me', help: 'show where you are', free: true },
  { usage: '!rename', help: 'pick a new name' },
  { usage: '!vote 1', help: 'vote for a world event', free: true },
] as const;

export const COMMAND_COOLDOWN_MS = 10_000;
