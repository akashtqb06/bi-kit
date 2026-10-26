export interface TreeItem {
  id: string;
  name: string;
  folderId?: string | null;
  position?: number;
}

export interface TreeFolder {
  id: string;
  name: string;
  position?: number;
  kind?: string;
}

export interface FolderGroup<TItem, TFolder extends TreeFolder = TreeFolder> {
  folder: TFolder;
  items: TItem[];
}

export interface SidebarTree<TItem, TFolder extends TreeFolder = TreeFolder> {
  folders: FolderGroup<TItem, TFolder>[];
  rootItems: TItem[];
}

function compareByName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
}

function compareFolders<T extends TreeFolder>(a: T, b: T): number {
  const posA = a.position ?? 0;
  const posB = b.position ?? 0;
  if (posA !== posB) {
    return posA - posB;
  }
  return compareByName(a, b);
}

export function buildSidebarTree<TItem extends TreeItem, TFolder extends TreeFolder>(
  items: TItem[],
  folders: TFolder[]
): SidebarTree<TItem, TFolder> {
  const sortedFolders = [...folders].sort(compareFolders);
  const folderMap = new Map<string, FolderGroup<TItem, TFolder>>();

  for (const folder of sortedFolders) {
    folderMap.set(folder.id, {
      folder,
      items: [],
    });
  }

  const rootItems: TItem[] = [];

  for (const item of items) {
    if (item.folderId && folderMap.has(item.folderId)) {
      folderMap.get(item.folderId)!.items.push(item);
    } else {
      rootItems.push(item);
    }
  }

  // Sort items inside each folder by name
  for (const group of folderMap.values()) {
    group.items.sort(compareByName);
  }

  // Sort root items by name
  rootItems.sort(compareByName);

  return {
    folders: sortedFolders.map((f) => folderMap.get(f.id)!),
    rootItems,
  };
}
