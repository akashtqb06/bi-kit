import { describe, it, expect } from "vitest";
import { buildSidebarTree } from "./sidebar-tree";

describe("buildSidebarTree", () => {
  it("groups items into their respective folders and root", () => {
    const folders = [
      { id: "f1", name: "Revenue", position: 0 },
      { id: "f2", name: "Operations", position: 1 },
    ];
    const items = [
      { id: "i1", name: "Orders", folderId: null },
      { id: "i2", name: "Revenue by Month", folderId: "f1" },
      { id: "i3", name: "Delivery Rates", folderId: "f2" },
      { id: "i4", name: "Revenue by Category", folderId: "f1" },
    ];

    const tree = buildSidebarTree(items, folders);

    expect(tree.folders).toHaveLength(2);
    expect(tree.folders[0].folder.name).toBe("Revenue");
    expect(tree.folders[0].items.map((i) => i.name)).toEqual([
      "Revenue by Category",
      "Revenue by Month",
    ]);

    expect(tree.folders[1].folder.name).toBe("Operations");
    expect(tree.folders[1].items.map((i) => i.name)).toEqual(["Delivery Rates"]);

    expect(tree.rootItems.map((i) => i.name)).toEqual(["Orders"]);
  });

  it("sorts folders first by position ascending, then by name ascending", () => {
    const folders = [
      { id: "f1", name: "Beta", position: 1 },
      { id: "f2", name: "Alpha", position: 1 },
      { id: "f3", name: "Priority", position: 0 },
    ];
    const items: { id: string; name: string }[] = [];

    const tree = buildSidebarTree(items, folders);

    expect(tree.folders.map((f) => f.folder.name)).toEqual(["Priority", "Alpha", "Beta"]);
  });

  it("sorts root items alphabetically by name", () => {
    const folders: { id: string; name: string }[] = [];
    const items = [
      { id: "i1", name: "Zebra", folderId: null },
      { id: "i2", name: "Apple", folderId: null },
      { id: "i3", name: "Mango", folderId: null },
    ];

    const tree = buildSidebarTree(items, folders);

    expect(tree.rootItems.map((i) => i.name)).toEqual(["Apple", "Mango", "Zebra"]);
  });

  it("places items with unknown or missing folderId at root level", () => {
    const folders = [{ id: "f1", name: "Valid Folder", position: 0 }];
    const items = [
      { id: "i1", name: "Orphan Item", folderId: "nonexistent-folder" },
      { id: "i2", name: "Child Item", folderId: "f1" },
    ];

    const tree = buildSidebarTree(items, folders);

    expect(tree.folders[0].items.map((i) => i.name)).toEqual(["Child Item"]);
    expect(tree.rootItems.map((i) => i.name)).toEqual(["Orphan Item"]);
  });

  it("handles empty folders and empty items gracefully", () => {
    const folders = [{ id: "f1", name: "Empty Folder", position: 0 }];
    const tree = buildSidebarTree([], folders);

    expect(tree.folders).toHaveLength(1);
    expect(tree.folders[0].items).toEqual([]);
    expect(tree.rootItems).toEqual([]);
  });
});

