// Folder nesting is stored in a side map (`folderParents`), so the invariants —
// one level, no orphans, no cycles — live entirely in these pure helpers rather
// than in the renderer. This suite is where they are pinned down; the DOM tests
// only check that displayFolders asks the right questions.

const {
  getFolderParent,
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

  test('a grandchild is refused rather than rendered at a third level', () => {
    const folders = { A: [], B: [], C: [] };
    // C → B → A would be depth 2.
    expect(getFolderParent(folders, { B: 'A', C: 'B' }, 'C')).toBeNull();
    expect(getFolderParent(folders, { B: 'A', C: 'B' }, 'B')).toBe('A');
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

  test.each([
    ['itself', 'Work', 'Work', 'self'],
    ['a sub-folder as the target', 'Personal', 'Clients', 'depth'],
    ['a folder that already has children', 'Parent', 'Work', 'depth'],
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

  test('drops orphans, self-references, depth-2 entries and vanished children', () => {
    const folders = { A: [], B: [], C: [], Solo: [] };
    const pruned = pruneFolderParents(folders, {
      B: 'A',          // valid
      C: 'B',          // depth 2
      Solo: 'Gone',    // orphan: parent no longer exists
      A: 'A',          // self-reference
      Deleted: 'A',    // the child itself is gone
    });
    expect(pruned).toEqual({ B: 'A' });
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
      .toEqual({ name: 'Clients', parent: 'Work', created: [], error: null });
  });
});

describe('resolveFolderPath', () => {
  test('an existing folder wins over the path reading, slash or not', () => {
    // The one that matters: a folder literally named "a/b" predates nesting.
    const folders = { 'a/b': [], a: [], b: [] };
    expect(resolveFolderPath(folders, {}, 'a/b'))
      .toEqual({ name: 'a/b', parent: null, created: [], error: null });
  });

  test('a plain name targets a top-level folder', () => {
    expect(resolveFolderPath(TREE.folders, TREE.parents, 'Work'))
      .toEqual({ name: 'Work', parent: null, created: [], error: null });
  });

  test('a new plain name is created at the top level', () => {
    expect(resolveFolderPath(TREE.folders, TREE.parents, 'Ideas'))
      .toEqual({ name: 'Ideas', parent: null, created: ['Ideas'], error: null });
  });

  test('an unknown pair creates both halves, nested', () => {
    expect(resolveFolderPath(TREE.folders, TREE.parents, 'Studies/Math'))
      .toEqual({ name: 'Math', parent: 'Studies', created: ['Studies', 'Math'], error: null });
  });

  test('an existing parent only creates the child', () => {
    expect(resolveFolderPath(TREE.folders, TREE.parents, 'Work/Invoices'))
      .toEqual({ name: 'Invoices', parent: 'Work', created: ['Invoices'], error: null });
  });

  test('refuses to nest under a folder that is itself nested', () => {
    expect(resolveFolderPath(TREE.folders, TREE.parents, 'Clients/Deep').error).toBe('nestTooDeep');
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
