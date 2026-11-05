// Folder nesting is stored in a side map (`folderParents`), so the invariants —
// at most MAX_FOLDER_DEPTH levels, no orphans, no cycles — live entirely in these pure helpers rather
// than in the renderer. This suite is where they are pinned down; the DOM tests
// only check that displayFolders asks the right questions.

const {
  MAX_FOLDER_DEPTH,
  getFolderParent,
  getFolderAncestors,
  getFolderDepth,
  getDescendantNames,
  getSubtreeHeight,
  getChildFolders,
  getRootFolderNames,
  folderSubtreeNames,
  sortedChildFolders,
  sortedRootFolders,
  flattenFolderChats,
  canNestFolder,
  withFolderParent,
  pruneFolderParents,
  folderDisplayPath,
  folderOpenPath,
  resolveFolderPath,
  folderSearchState,
  buildContextMenuModel,
} = require('../src/utils');

const chat = (title, timestamp) => ({ title, url: `https://a/${title}`, timestamp });

// Work ─ Clients          Personal (root, no children)
const TREE = {
  folders: {
    Work: [chat('w1', 10)],
    Clients: [chat('c1', 30)],
    Personal: [chat('p1', 20)],
  },
  parents: { Clients: 'Work' },
};

describe('getFolderParent', () => {
  test('returns the parent of a nested folder and null for a root one', () => {
    expect(getFolderParent(TREE.folders, TREE.parents, 'Clients')).toBe('Work');
    expect(getFolderParent(TREE.folders, TREE.parents, 'Work')).toBeNull();
    expect(getFolderParent(TREE.folders, TREE.parents, 'Personal')).toBeNull();
  });

  test('an orphan (parent deleted elsewhere) reads as a root folder', () => {
    expect(getFolderParent({ Clients: [] }, { Clients: 'Work' }, 'Clients')).toBeNull();
  });

  test('a grandchild is honoured: nesting goes several levels deep', () => {
    const folders = { A: [], B: [], C: [] };
    expect(getFolderParent(folders, { B: 'A', C: 'B' }, 'C')).toBe('B');
    expect(getFolderParent(folders, { B: 'A', C: 'B' }, 'B')).toBe('A');
  });

  test('a chain deeper than this version allows reads as a root folder, in one piece', () => {
    // E → D → C → B → A is five levels: written by a future version, perhaps.
    const folders = { A: [], B: [], C: [], D: [], E: [] };
    const parents = { B: 'A', C: 'B', D: 'C', E: 'D' };
    expect(getFolderParent(folders, parents, 'D')).toBe('C');
    expect(getFolderParent(folders, parents, 'E')).toBeNull();
  });

  test('a longer cycle terminates and every member reads as a root folder', () => {
    const folders = { A: [], B: [], C: [] };
    const parents = { A: 'C', B: 'A', C: 'B' };
    for (const n of ['A', 'B', 'C']) expect(getFolderParent(folders, parents, n)).toBeNull();
    expect(getRootFolderNames(folders, parents).sort()).toEqual(['A', 'B', 'C']);
  });

  test('a child below a broken chain drops to the top level with it', () => {
    // A ↔ B is a cycle; C hangs off it and must not render under a ghost.
    const folders = { A: [], B: [], C: [] };
    expect(getFolderParent(folders, { A: 'B', B: 'A', C: 'A' }, 'C')).toBeNull();
  });

  test('a two-folder cycle sends both back to the top level instead of looping', () => {
    const folders = { A: [], B: [] };
    expect(getFolderParent(folders, { A: 'B', B: 'A' }, 'A')).toBeNull();
    expect(getFolderParent(folders, { A: 'B', B: 'A' }, 'B')).toBeNull();
  });

  test('a folder that is its own parent reads as a root folder', () => {
    expect(getFolderParent({ A: [] }, { A: 'A' }, 'A')).toBeNull();
  });

  test('an inherited name is not a parent entry (hasEntry, not truthiness)', () => {
    expect(getFolderParent({ toString: [] }, {}, 'toString')).toBeNull();
  });
});

describe('children and roots', () => {
  test('splits the flat namespace into roots and children', () => {
    expect(getRootFolderNames(TREE.folders, TREE.parents).sort()).toEqual(['Personal', 'Work']);
    expect(getChildFolders(TREE.folders, TREE.parents, 'Work')).toEqual(['Clients']);
    expect(getChildFolders(TREE.folders, TREE.parents, 'Personal')).toEqual([]);
  });

  test('folderSubtreeNames lists what a delete has to remove', () => {
    expect(folderSubtreeNames(TREE.folders, TREE.parents, 'Work')).toEqual(['Work', 'Clients']);
    expect(folderSubtreeNames(TREE.folders, TREE.parents, 'Clients')).toEqual(['Clients']);
  });
});

describe('ordering', () => {
  test('a root is ranked on its whole subtree, not just its own conversations', () => {
    // Work's own chat is older than Personal's, but its sub-folder holds the
    // newest conversation of all — so Work must come first under dateDesc.
    expect(sortedRootFolders(TREE.folders, TREE.parents, [], 'dateDesc')).toEqual(['Work', 'Personal']);
    // Children never appear in the root list.
    expect(sortedRootFolders(TREE.folders, TREE.parents, [], 'dateDesc')).not.toContain('Clients');
  });

  test('a pinned root still wins over an active one', () => {
    expect(sortedRootFolders(TREE.folders, TREE.parents, ['Personal'], 'dateDesc'))
      .toEqual(['Personal', 'Work']);
  });

  test('a dormant pin does not reorder sub-folders', () => {
    const folders = { Work: [], Alpha: [chat('a', 1)], Beta: [chat('b', 2)] };
    const parents = { Alpha: 'Work', Beta: 'Work' };
    // Beta is pinned, but pins are ignored inside a parent: dateDesc order stands.
    expect(sortedChildFolders(folders, parents, 'Work', 'dateDesc')).toEqual(['Beta', 'Alpha']);
    expect(sortedChildFolders(folders, parents, 'Work', 'alphaAsc')).toEqual(['Alpha', 'Beta']);
  });

  test('flattenFolderChats returns own conversations first, then each child\'s', () => {
    const folders = {
      Work: [chat('w1', 1), chat('w2', 5)],
      Clients: [chat('c1', 9)],
      Research: [chat('r1', 7)],
    };
    const parents = { Clients: 'Work', Research: 'Work' };
    expect(flattenFolderChats(folders, parents, 'Work', 'dateDesc').map(c => c.title))
      .toEqual(['w2', 'w1', 'c1', 'r1']);
    // A child only ever contributes its own conversations.
    expect(flattenFolderChats(folders, parents, 'Clients', 'dateDesc').map(c => c.title)).toEqual(['c1']);
  });
});

describe('canNestFolder', () => {
  const folders = { Work: [], Clients: [], Personal: [], Parent: [], Kid: [] };
  const parents = { Clients: 'Work', Kid: 'Parent' };

  test('accepts a root folder dropped on another root folder', () => {
    expect(canNestFolder(folders, parents, 'Personal', 'Work')).toEqual({ ok: true });
  });

  test('accepts a sub-folder as the target, and a folder that has children', () => {
    expect(canNestFolder(folders, parents, 'Personal', 'Clients')).toEqual({ ok: true });
    expect(canNestFolder(folders, parents, 'Parent', 'Work')).toEqual({ ok: true });
  });

  test.each([
    ['itself', 'Work', 'Work', 'self'],
    ['its own sub-folder (a cycle)', 'Work', 'Clients', 'cycle'],
    ['its current parent', 'Clients', 'Work', 'already'],
    ['a folder that does not exist', 'Ghost', 'Work', 'missing'],
    ['a reserved name', '__proto__', 'Work', 'missing'],
  ])('refuses %s', (_label, child, parent, reason) => {
    expect(canNestFolder(folders, parents, child, parent)).toEqual({ ok: false, reason });
  });
});

describe('withFolderParent / pruneFolderParents', () => {
  test('nests and un-nests without mutating the original map', () => {
    const before = { Clients: 'Work' };
    expect(withFolderParent(before, 'Personal', 'Work')).toEqual({ Clients: 'Work', Personal: 'Work' });
    expect(withFolderParent(before, 'Clients', null)).toEqual({});
    expect(before).toEqual({ Clients: 'Work' });
  });

  test('drops orphans, self-references, cycles, over-deep entries and vanished children', () => {
    const folders = { A: [], B: [], C: [], D: [], E: [], Solo: [], X: [], Y: [] };
    const pruned = pruneFolderParents(folders, {
      B: 'A',          // valid
      C: 'B',          // valid, level 3
      D: 'C',          // valid, level 4
      E: 'D',          // level 5: deeper than allowed
      Solo: 'Gone',    // orphan: parent no longer exists
      A: 'A',          // self-reference
      X: 'Y', Y: 'X',  // cycle
      Deleted: 'A',    // the child itself is gone
    });
    expect(pruned).toEqual({ B: 'A', C: 'B', D: 'C' });
  });
});

describe('display path', () => {
  test('shows Parent/Child for a sub-folder and the bare name at the top level', () => {
    expect(folderDisplayPath(TREE.folders, TREE.parents, 'Clients')).toBe('Work/Clients');
    expect(folderDisplayPath(TREE.folders, TREE.parents, 'Work')).toBe('Work');
  });

  test('folderOpenPath expands the parent too, so a child is not saved out of sight', () => {
    expect(folderOpenPath(TREE.folders, TREE.parents, 'Clients')).toEqual(['Work', 'Clients']);
    expect(folderOpenPath(TREE.folders, TREE.parents, 'Work')).toEqual(['Work']);
  });

  test('a display path round-trips through resolveFolderPath', () => {
    const path = folderDisplayPath(TREE.folders, TREE.parents, 'Clients');
    expect(resolveFolderPath(TREE.folders, TREE.parents, path))
      .toEqual({ name: 'Clients', parent: 'Work', chain: ['Work'], created: [], error: null });
  });
});

describe('resolveFolderPath', () => {
  test('an existing folder wins over the path reading, slash or not', () => {
    // The one that matters: a folder literally named "a/b" predates nesting.
    const folders = { 'a/b': [], a: [], b: [] };
    expect(resolveFolderPath(folders, {}, 'a/b'))
      .toEqual({ name: 'a/b', parent: null, chain: [], created: [], error: null });
  });

  test('a plain name targets a top-level folder', () => {
    expect(resolveFolderPath(TREE.folders, TREE.parents, 'Work'))
      .toEqual({ name: 'Work', parent: null, chain: [], created: [], error: null });
  });

  test('a new plain name is created at the top level', () => {
    expect(resolveFolderPath(TREE.folders, TREE.parents, 'Ideas'))
      .toEqual({ name: 'Ideas', parent: null, chain: [], created: ['Ideas'], error: null });
  });

  test('an unknown pair creates both halves, nested', () => {
    expect(resolveFolderPath(TREE.folders, TREE.parents, 'Studies/Math'))
      .toEqual({ name: 'Math', parent: 'Studies', chain: ['Studies'], created: ['Studies', 'Math'], error: null });
  });

  test('an existing parent only creates the child', () => {
    expect(resolveFolderPath(TREE.folders, TREE.parents, 'Work/Invoices'))
      .toEqual({ name: 'Invoices', parent: 'Work', chain: ['Work'], created: ['Invoices'], error: null });
  });

  test('a path may start at a nested folder: what is above it comes along', () => {
    expect(resolveFolderPath(TREE.folders, TREE.parents, 'Clients/Deep'))
      .toEqual({ name: 'Deep', parent: 'Clients', chain: ['Work', 'Clients'], created: ['Deep'], error: null });
  });

  test('refuses to silently re-parent a folder that already exists elsewhere', () => {
    expect(resolveFolderPath(TREE.folders, TREE.parents, 'Personal/Clients').error).toBe('exists');
  });

  test('whitespace around the slash is trimmed', () => {
    expect(resolveFolderPath(TREE.folders, TREE.parents, ' Work / Invoices ').parent).toBe('Work');
  });

  test('an empty value asks the caller for its own default', () => {
    expect(resolveFolderPath(TREE.folders, TREE.parents, '   ').name).toBeNull();
  });

  test('a reserved segment falls back to a plain folder name', () => {
    const result = resolveFolderPath(TREE.folders, TREE.parents, '__proto__/x');
    expect(result.parent).toBeNull();
    expect(result.name).toBe('__proto__/x');
  });
});

describe('folderSearchState', () => {
  const folders = {
    Work: [chat('quarterly report', 1)],
    Clients: [chat('acme onboarding', 2)],
    Personal: [chat('recipes', 3)],
  };
  const parents = { Clients: 'Work' };
  const state = (name, term) => folderSearchState(folders, parents, name, term);

  test('no search term shows everything', () => {
    expect(state('Personal', '')).toEqual({ show: true, showAllChats: true });
  });

  test('a root surfaces when only its sub-folder name matches', () => {
    expect(state('Work', 'client').show).toBe(true);
    expect(state('Work', 'client').showAllChats).toBe(false);
    expect(state('Clients', 'client')).toEqual({ show: true, showAllChats: true });
    expect(state('Personal', 'client').show).toBe(false);
  });

  test('a root surfaces when only a conversation inside its sub-folder matches', () => {
    expect(state('Work', 'acme').show).toBe(true);
    expect(state('Clients', 'acme')).toEqual({ show: true, showAllChats: false });
  });

  test('a matching parent name reveals its whole sub-folder', () => {
    expect(state('Work', 'work')).toEqual({ show: true, showAllChats: true });
    expect(state('Clients', 'work')).toEqual({ show: true, showAllChats: true });
  });

  test('a folder with nothing matching is filtered out', () => {
    expect(state('Work', 'zzz').show).toBe(false);
    expect(state('Clients', 'zzz').show).toBe(false);
  });
});

describe('buildContextMenuModel', () => {
  const model = () => buildContextMenuModel(TREE.folders, TREE.parents,
    { rootId: 'root', saveHereTitle: 'ctxMenuSave' });

  test('a childless root is a single clickable item', () => {
    expect(model()).toContainEqual({ id: 'folder_Personal', parentId: 'root', title: '📁 Personal' });
  });

  test('a root with children becomes a submenu that stays selectable itself', () => {
    expect(model()).toEqual([
      { id: 'folder_Personal', parentId: 'root', title: '📁 Personal' },
      { id: 'sub_Work', parentId: 'root', title: '📁 Work' },
      { id: 'folder_Work', parentId: 'sub_Work', title: 'ctxMenuSave' },
      { id: 'sep_Work', parentId: 'sub_Work', type: 'separator' },
      { id: 'folder_Clients', parentId: 'sub_Work', title: '📁 Clients' },
    ]);
  });

  test('every save target is a folder_ id — a submenu container is never one', () => {
    for (const item of model()) {
      if (item.type === 'separator') continue;
      const isTarget = item.id.startsWith('folder_');
      expect(isTarget || item.id.startsWith('sub_')).toBe(true);
      // The name is recoverable from the id alone, which is what survives a
      // service-worker restart.
      if (isTarget) expect(TREE.folders[item.id.slice('folder_'.length)]).toBeDefined();
    }
  });

  test('a custom emoji prefix is kept as the menu icon', () => {
    const items = buildContextMenuModel({ '🚀 Launch': [] }, {}, { rootId: 'root' });
    expect(items[0].title).toBe('🚀 Launch');
  });
});

// ── Several levels (#117) ────────────────────────────────────────────────────
// Root → L2 → L3 → L4 is the deepest tree allowed; Side is an unrelated root.
describe('several levels deep', () => {
  const DEEP = {
    folders: {
      Root: [chat('r', 1)], L2: [chat('l2', 2)], L3: [chat('l3', 3)], L4: [chat('l4', 9)],
      Side: [chat('s', 5)], Pair: [], PairKid: [],
    },
    parents: { L2: 'Root', L3: 'L2', L4: 'L3', PairKid: 'Pair' },
  };
  const { folders, parents } = DEEP;

  test('the cap is four levels, the top level included', () => {
    expect(MAX_FOLDER_DEPTH).toBe(4);
  });

  test('depth, ancestors, descendants and height follow the chain', () => {
    expect(getFolderDepth(folders, parents, 'Root')).toBe(1);
    expect(getFolderDepth(folders, parents, 'L4')).toBe(4);
    expect(getFolderAncestors(folders, parents, 'L4')).toEqual(['Root', 'L2', 'L3']);
    expect(getDescendantNames(folders, parents, 'Root')).toEqual(['L2', 'L3', 'L4']);
    expect(getSubtreeHeight(folders, parents, 'Root')).toBe(4);
    expect(getSubtreeHeight(folders, parents, 'L4')).toBe(1);
  });

  test('a delete takes every level below the folder', () => {
    expect(folderSubtreeNames(folders, parents, 'L2')).toEqual(['L2', 'L3', 'L4']);
  });

  test('levels 2, 3 and 4 accept a folder; a fifth level is refused', () => {
    expect(canNestFolder(folders, parents, 'Side', 'Root')).toEqual({ ok: true });
    expect(canNestFolder(folders, parents, 'Side', 'L2')).toEqual({ ok: true });
    expect(canNestFolder(folders, parents, 'Side', 'L3')).toEqual({ ok: true });
    expect(canNestFolder(folders, parents, 'Side', 'L4')).toEqual({ ok: false, reason: 'depth' });
  });

  test('a folder brings its subtree: its height has to fit under the target', () => {
    // Pair has a child, so it needs two levels: fine under L2, too deep under L3.
    expect(canNestFolder(folders, parents, 'Pair', 'L2')).toEqual({ ok: true });
    expect(canNestFolder(folders, parents, 'Pair', 'L3')).toEqual({ ok: false, reason: 'depth' });
  });

  test('a folder cannot go into any of its own descendants', () => {
    expect(canNestFolder(folders, parents, 'Root', 'L4')).toEqual({ ok: false, reason: 'cycle' });
    expect(canNestFolder(folders, parents, 'L2', 'L3')).toEqual({ ok: false, reason: 'cycle' });
  });

  test('ordering and the tab group see the whole subtree, at every level', () => {
    expect(flattenFolderChats(folders, parents, 'Root', 'dateDesc').map(c => c.title))
      .toEqual(['r', 'l2', 'l3', 'l4']);
    // Root's own chat is the oldest, but L4, three levels down, holds the newest.
    expect(sortedRootFolders(folders, parents, [], 'dateDesc')[0]).toBe('Root');
  });

  test('a sub-folder is ranked on its subtree too', () => {
    const f = { P: [], Old: [chat('o', 1)], Busy: [chat('b', 2)], Deep: [chat('d', 99)] };
    const p = { Old: 'P', Busy: 'P', Deep: 'Old' };
    expect(sortedChildFolders(f, p, 'P', 'dateDesc')).toEqual(['Old', 'Busy']);
  });

  test('display and open paths carry the whole chain and round-trip', () => {
    expect(folderDisplayPath(folders, parents, 'L4')).toBe('Root/L2/L3/L4');
    expect(folderOpenPath(folders, parents, 'L4')).toEqual(['Root', 'L2', 'L3', 'L4']);
    expect(resolveFolderPath(folders, parents, 'Root/L2/L3/L4'))
      .toEqual({ name: 'L4', parent: 'L3', chain: ['Root', 'L2', 'L3'], created: [], error: null });
  });

  test('a search match four levels down surfaces all three folders above it', () => {
    for (const n of ['Root', 'L2', 'L3']) {
      expect(folderSearchState(folders, parents, n, 'l4')).toEqual({ show: true, showAllChats: false });
    }
    expect(folderSearchState(folders, parents, 'L4', 'l4').show).toBe(true);
    // A matching top-level name reveals everything below it, at every level.
    expect(folderSearchState(folders, parents, 'L4', 'root')).toEqual({ show: true, showAllChats: true });
  });

  test('the right-click menu follows the tree, with "save here" in every submenu', () => {
    const items = buildContextMenuModel(folders, parents, { rootId: 'root', saveHereTitle: 'here' });
    const byId = Object.fromEntries(items.map(i => [i.id, i]));
    expect(byId.sub_Root.parentId).toBe('root');
    expect(byId.sub_L2.parentId).toBe('sub_Root');
    expect(byId.sub_L3.parentId).toBe('sub_L2');
    expect(byId.folder_L4.parentId).toBe('sub_L3');
    expect(byId.folder_L3).toEqual({ id: 'folder_L3', parentId: 'sub_L3', title: 'here' });
    expect(items.filter(i => i.id === 'folder_L4')).toHaveLength(1);
  });
});

describe('resolveFolderPath, several levels', () => {
  const folders = { Work: [], Clients: [], 'a/b': [] };
  const parents = { Clients: 'Work' };

  test('creates every missing level of a path', () => {
    expect(resolveFolderPath(folders, parents, 'Work/Clients/Acme/2026'))
      .toEqual({ name: '2026', parent: 'Acme', chain: ['Work', 'Clients', 'Acme'], created: ['Acme', '2026'], error: null });
    expect(resolveFolderPath({}, {}, 'A/B/C').created).toEqual(['A', 'B', 'C']);
  });

  test('a fifth level is refused, including through what sits above the start', () => {
    expect(resolveFolderPath({}, {}, 'A/B/C/D/E').error).toBe('nestTooDeep');
    expect(resolveFolderPath(folders, parents, 'Clients/X/Y/Z').error).toBe('nestTooDeep');
    expect(resolveFolderPath(folders, parents, 'Clients/X/Y').error).toBeNull();
  });

  test('a segment that exists elsewhere in the tree is refused, not re-parented', () => {
    expect(resolveFolderPath(folders, parents, 'Work/New/Clients').error).toBe('exists');
  });

  test('a repeated name inside one path is refused', () => {
    expect(resolveFolderPath({}, {}, 'A/B/A').error).toBe('exists');
  });

  test('an existing name containing a slash is read as one level', () => {
    expect(resolveFolderPath(folders, parents, 'a/b/c'))
      .toEqual({ name: 'c', parent: 'a/b', chain: ['a/b'], created: ['c'], error: null });
  });
});
