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
  { usage: '!help', help: 'show these commands', free: true },
  { usage: '!rename', help: 'pick a new name' },
  { usage: '!vote 1', help: 'vote for a world event', free: true },
  { usage: '!war red', help: 'chief only: declare war on a tribe', chief: true, short: 'declare war' },
  { usage: '!peace red', help: 'chief only: make peace', chief: true, short: 'make peace' },
  { usage: '!rally', help: 'chief only: everyone to me', chief: true, short: 'army to me' },
  { usage: '!tax', help: 'chief only: 5 food → 5 gold', chief: true, short: '5 food → 5 gold' },
] as const;

export const COMMAND_COOLDOWN_MS = 10_000;
/** !help shows the command list on screen at most once per minute, however many viewers ask. */
export const HELP_COOLDOWN_MS = 60_000;
export const HELP_SHOW_MS = 12_000;
