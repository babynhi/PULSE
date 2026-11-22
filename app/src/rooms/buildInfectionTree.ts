import type { GameEvent, Role } from '../../../shared/protocol';

export type InfectionNode = {
  name: string;
  origin: 'starter' | 'bite' | 'unrecorded';
  parent?: string;
  time?: number;
  isDoctor?: boolean;
  cure?: { time: number; actor?: string };
  children: InfectionNode[];
};

export function buildInfectionTree(standings: readonly { name: string; startRole: Role }[], events: readonly GameEvent[]) {
  const roots: InfectionNode[] = [];
  const active = new Map<string, InfectionNode>();
  const doctor = standings.find(player => player.startRole === 'doctor')?.name;

  for (const { name, startRole } of standings) {
    if (startRole !== 'infected') continue;
    const root: InfectionNode = { name, origin: 'starter', children: [] };
    roots.push(root);
    active.set(name, root);
  }

  // The event log is in play order, including events that share a timestamp.
  for (const event of events) {
    if (event.kind !== 'bite') {
      const episode = active.get(event.target);
      if (event.kind === 'heal' && episode) episode.cure = { time: event.t, actor: event.actor };
      active.delete(event.target);
      continue;
    }

    let parent = event.actor ? active.get(event.actor) : undefined;
    if (event.actor && !parent) {
      parent = { name: event.actor, origin: 'unrecorded', isDoctor: event.actor === doctor, children: [] };
      roots.push(parent);
      active.set(event.actor, parent);
    }
    const node: InfectionNode = {
      name: event.target, origin: 'bite', parent: event.actor, time: event.t, isDoctor: event.target === doctor, children: [],
    };
    (parent?.children ?? roots).push(node);
    active.set(event.target, node);
  }

  return { roots, doctor };
}
