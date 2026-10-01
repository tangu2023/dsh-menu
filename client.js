window.__ModuleLoader__.load({
	id: "dsh-menu",
	factory(require) {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const { jsx, jsxs, Fragment } = require("react/jsx-runtime");
		const { useEffect, useRef, useState, useSyncExternalStore } = React;

		//#region locale
		const NS = "workspaceFilesMenu";

		/**
		 * Display-only path formatting: the tree hands us the workspace root in
		 * native form and child segments with `/`, so a Windows path can read as
		 * `D:\workspace/proj`. Normalize the separator for the header; the raw
		 * value is still what every action sends to the Host.
		 */
		const isWindowsPlatform = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
		function displayPath(value) {
			const text = String(value);
			return isWindowsPlatform ? text.replaceAll("/", "\\") : text;
		}

		const zh = {
			rename: "重命名",
			reveal: "在文件管理器中显示",
			openInBrowser: "在浏览器中打开",
			openInVscode: "在VS Code中打开",
			copyPath: "复制文件路径",
			downloadFolder: "下载文件夹",
			downloadFile: "下载文件",
			delete: "删除",
			cancel: "取消",
			confirm: "确认",
			confirmDelete: "确认删除",
			confirmDeletePrompt: "确定要删除 {name} 吗？此操作不可撤销。",
			renamePrompt: "重命名 {name}",
			renameSubmit: "重命名",
			renamePlaceholder: "新名称",
			copied: "已复制路径",
			renamed: "已重命名",
			deleted: "已删除",
			revealed: "已在文件管理器中显示",
			vscodeRequested: "已请求在 VS Code 中打开",
			downloading: "开始下载…",
			newFolder: "新建文件夹",
			newFolderPlaceholder: "新文件夹名称",
			newFolderSubmit: "创建",
			newFolderPrompt: "在 {name} 中新建文件夹",
			folderCreated: "已创建文件夹",
			busy: "处理中…"
		};
		const en = {
			rename: "Rename",
			reveal: "Show in File Manager",
			openInBrowser: "Open in Browser",
			openInVscode: "Open in VS Code",
			copyPath: "Copy Path",
			downloadFolder: "Download Folder",
			downloadFile: "Download File",
			delete: "Delete",
			cancel: "Cancel",
			confirm: "Confirm",
			confirmDelete: "Confirm Delete",
			confirmDeletePrompt: "Delete {name}? This cannot be undone.",
			renamePrompt: "Rename {name}",
			renameSubmit: "Rename",
			renamePlaceholder: "New name",
			copied: "Path copied",
			renamed: "Renamed",
			deleted: "Deleted",
			revealed: "Shown in file manager",
			vscodeRequested: "Requested to open in VS Code",
			downloading: "Download started…",
			newFolder: "New Folder",
			newFolderPlaceholder: "New folder name",
			newFolderSubmit: "Create",
			newFolderPrompt: "New folder in {name}",
			folderCreated: "Folder created",
			busy: "Working…"
		};
		//#endregion

		//#region store
		/** Minimal observable snapshot store; no Harness Client package imports. */
		function createMenuStore() {
			let state = null;
			const listeners = new Set();
			return {
				get: () => state,
				subscribe(listener) {
					listeners.add(listener);
					return () => { listeners.delete(listener); };
				},
				set(next) {
					state = next;
					for (const listener of [...listeners]) listener();
				}
			};
		}
		const menuStore = createMenuStore();
		//#endregion

		//#region icons
		function Icon({ children, className }) {
			return jsx("svg", {
				className,
				width: 14,
				height: 14,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true,
				children
			});
		}
		const IconRename = jsx(Icon, { children: [jsx("path", { d: "M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" })] });
		const IconReveal = jsx(Icon, { children: [jsx("path", { d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" })] });
		const IconBrowser = jsx(Icon, { children: [jsx("circle", { cx: 12, cy: 12, r: 10 }), jsx("path", { d: "M2 12h20" }), jsx("path", { d: "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" })] });
		const IconVscode = jsx(Icon, { children: [jsx("path", { d: "m16 18 6-6-6-6" }), jsx("path", { d: "m8 6-6 6 6 6" })] });
		const IconCopy = jsx(Icon, { children: [jsx("rect", { x: 9, y: 9, width: 13, height: 13, rx: 2 }), jsx("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })] });
		const IconDownload = jsx(Icon, { children: [jsx("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }), jsx("path", { d: "m7 10 5 5 5-5" }), jsx("path", { d: "M12 15V3" })] });
		const IconFolderPlus = jsx(Icon, { children: [jsx("path", { d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" }), jsx("line", { x1: 12, y1: 11, x2: 12, y2: 17 }), jsx("line", { x1: 9, y1: 14, x2: 15, y2: 14 })] });
		const IconDelete = jsx(Icon, { children: [jsx("path", { d: "M3 6h18" }), jsx("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" }), jsx("path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }), jsx("line", { x1: 10, y1: 11, x2: 10, y2: 17 }), jsx("line", { x1: 14, y1: 11, x2: 14, y2: 17 })] });
		//#endregion

		//#region styles
		const STYLES = `
.wfm-card {
	box-sizing: border-box;
	min-width: 208px;
	max-width: 320px;
	max-height: min(360px, calc(100vh - 20px));
	overflow-y: auto;
	padding: 4px;
	display: flex;
	flex-direction: column;
	gap: 0;
	border: 0;
	background: var(--dsw-alias-bg-overlay);
	background: color-mix(in srgb, var(--dsw-alias-bg-overlay) 78%, transparent);
	backdrop-filter: blur(18px) saturate(140%);
	-webkit-backdrop-filter: blur(18px) saturate(140%);
	--dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
	box-shadow: var(--dsw-elevation-prominent);
	--dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
	--dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}
.wfm-portal {
	position: fixed;
	z-index: 2100;
}
.wfm-item {
	display: flex;
	align-items: center;
	gap: 7px;
	width: 100%;
	min-height: 32px;
	padding: 5px 8px;
	border: none;
	border-radius: var(--dsw-radius-md);
	background: transparent;
	cursor: pointer;
	font-size: 13px;
	line-height: 20px;
	color: var(--dsw-alias-label-primary);
	text-align: left;
}
.wfm-item:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.wfm-item:focus-visible:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); outline: none; }
.wfm-item:disabled { opacity: 0.4; cursor: not-allowed; }
.wfm-itemIcon { flex: none; width: 14px; height: 14px; display: block; }
.wfm-itemLabel { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wfm-danger { color: var(--dsw-alias-state-error-primary); }
.wfm-separator { height: 1px; margin: 4px 6px; background: var(--dsw-alias-border-l2); flex: none; }
.wfm-header {
	padding: 5px 10px 3px;
	font-size: 12px;
	line-height: 18px;
	color: var(--dsw-alias-label-secondary);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.wfm-input {
	box-sizing: border-box;
	width: 100%;
	height: 30px;
	padding: 4px 8px;
	border: 1px solid var(--dsw-alias-border-l3);
	border-radius: var(--dsw-radius-md);
	background: var(--dsw-alias-bg-layer-1);
	color: var(--dsw-alias-label-primary);
	font-size: 13px;
	line-height: 20px;
}
.wfm-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.wfm-errors {
	padding: 4px 8px 2px;
	font-size: 12px;
	line-height: 18px;
	color: var(--dsw-alias-state-error-primary);
	white-space: pre-wrap;
	word-break: break-all;
}
.wfm-actions { display: flex; gap: 6px; justify-content: flex-end; padding: 6px 2px 2px; }
.wfm-btn {
	box-sizing: border-box;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 4px;
	min-height: 28px;
	padding: 0 10px;
	border: none;
	border-radius: var(--dsw-radius-sm);
	cursor: pointer;
	font-size: 12px;
	line-height: 18px;
	color: var(--dsw-alias-label-primary);
	background: transparent;
}
.wfm-btn:disabled { cursor: not-allowed; opacity: 0.4; }
.wfm-btnOutline { border: 0.5px solid var(--dsw-alias-border-l3); }
.wfm-btnOutline:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.wfm-btnPrimary { background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); }
.wfm-btnPrimary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.wfm-btnDanger { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.wfm-btnDanger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.wfm-toast {
	position: fixed;
	top: 18px;
	left: 50%;
	transform: translate(-50%, 0);
	z-index: 2200;
	padding: 8px 14px;
	border: 1px solid var(--dsw-alias-border-l1);
	border-radius: var(--dsw-radius-md);
	background: var(--dsw-alias-bg-overlay);
	background: color-mix(in srgb, var(--dsw-alias-bg-overlay) 78%, transparent);
	backdrop-filter: blur(18px) saturate(140%);
	-webkit-backdrop-filter: blur(18px) saturate(140%);
	color: var(--dsw-alias-label-primary);
	box-shadow: var(--dsw-elevation-prominent);
	font-size: 13px;
	line-height: 20px;
	pointer-events: none;
	animation: wfm-toast-in 160ms ease;
}
.wfm-toastError { color: var(--dsw-alias-state-error-primary); }
@keyframes wfm-toast-in {
	from { opacity: 0; transform: translate(-50%, -6px); }
	to { opacity: 1; transform: translate(-50%, 0); }
}
@media (prefers-reduced-motion: reduce) {
	.wfm-toast { animation: none; }
}
`;
		//#endregion

		//#region actions
		async function postJson(route, body) {
			const response = await fetch(route.slice(1), {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body)
			});
			let payload = null;
			try {
				payload = await response.json();
			} catch {
				/* non-JSON body */
			}
			if (!response.ok) {
				const message = payload && typeof payload === "object" && payload.error && typeof payload.error.message === "string"
					? payload.error.message
					: `请求失败 (HTTP ${String(response.status)})`;
				throw new Error(message);
			}
			return payload;
		}

		function makeActions(ctx) {
			return {
				async rename(sessionId, path, name) {
					await postJson("/api/workspace-files-menu/rename", { sessionId, path, name });
				},
				async remove(sessionId, path) {
					await postJson("/api/workspace-files-menu/delete", { sessionId, path });
				},
				async mkdir(sessionId, path, name) {
					await postJson("/api/workspace-files-menu/mkdir", { sessionId, path, name });
				},
				async openInVscode(sessionId, path) {
					await postJson("/api/workspace-files-menu/open-app", { sessionId, path, app: "vscode" });
				},
				async reveal(sessionId, path) {
					const result = await ctx.remote.session.openWorkspacePath({ path, action: "reveal" });
					if (!result.ok) throw new Error(result.error && result.error.message ? result.error.message : "无法在文件管理器中显示");
				},
				openInBrowser(sessionId, path) {
					const url = `api/workspace-files-menu/open?sessionId=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(path)}`;
					window.open(url, "_blank", "noopener");
				},
				download(sessionId, path) {
					const url = `api/workspace-files-menu/download?sessionId=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(path)}`;
					const anchor = document.createElement("a");
					anchor.href = url;
					anchor.download = "";
					anchor.rel = "noopener";
					document.body.appendChild(anchor);
					anchor.click();
					anchor.remove();
				},
				async copyText(text) {
					try {
						await navigator.clipboard.writeText(text);
					} catch {
						const textarea = document.createElement("textarea");
						textarea.value = text;
						textarea.setAttribute("readonly", "");
						textarea.style.position = "fixed";
						textarea.style.top = "-1000px";
						textarea.style.opacity = "0";
						document.body.appendChild(textarea);
						textarea.select();
						try {
							document.execCommand("copy");
						} finally {
							textarea.remove();
						}
					}
				}
			};
		}
		//#endregion

		//#region component
		function MenuItem({ icon, label, danger, disabled, onClick, t }) {
			return jsx("button", {
				type: "button",
				className: danger ? "wfm-item wfm-danger" : "wfm-item",
				disabled,
				onClick,
				children: [jsx("span", { className: "wfm-itemIcon", children: icon }), jsx("span", { className: "wfm-itemLabel", children: label })]
			});
		}

		function FilesContextMenu(props) {
			const { menu, actions, t } = props;
			const state = useSyncExternalStore(menu.subscribe, menu.get, menu.get);
			const [draft, setDraft] = useState("");
			const composingRef = useRef(false);
			const inputRef = useRef(null);
			const cardRef = useRef(null);

			const setState = (patch) => {
				const current = menu.get();
				if (current === null) return;
				menu.set({ ...current, ...patch });
			};

			// Toast auto-dismiss.
			useEffect(() => {
				if (state === null || state.toast === null) return;
				const timer = setTimeout(() => {
					const current = menu.get();
					if (current !== null && current.toast === state.toast) setState({ toast: null });
				}, 2600);
				return () => clearTimeout(timer);
			}, [state === null ? null : state.toast]);

			// Outside pointer / Escape / scroll / resize close.
			useEffect(() => {
				if (state === null || !state.open) return;
				const close = () => {
					const current = menu.get();
					if (current !== null) menu.set({ ...current, open: false, phase: "menu", error: null });
				};
				const onPointerDown = (event) => {
					if (cardRef.current !== null && !cardRef.current.contains(event.target)) close();
				};
				const onKeyDown = (event) => {
					if (event.key === "Escape") close();
				};
				const onScroll = () => close();
				const onResize = () => close();
				document.addEventListener("pointerdown", onPointerDown, true);
				document.addEventListener("keydown", onKeyDown, true);
				document.addEventListener("scroll", onScroll, true);
				window.addEventListener("resize", onResize);
				return () => {
					document.removeEventListener("pointerdown", onPointerDown, true);
					document.removeEventListener("keydown", onKeyDown, true);
					document.removeEventListener("scroll", onScroll, true);
					window.removeEventListener("resize", onResize);
				};
			}, [state === null ? null : state.open, state === null ? null : state.path]);

			// Autofocus + select when the rename / new-folder phase opens.
			useEffect(() => {
				if (state !== null && (state.phase === "rename" || state.phase === "new-folder") && inputRef.current !== null) {
					inputRef.current.focus();
					if (state.phase === "rename") inputRef.current.select();
				}
			}, [state === null ? null : state.phase]);

			if (state === null) return null;

			if (!state.open) {
				if (state.toast !== null) {
					return jsx("div", {
						className: state.toast.kind === "error" ? "wfm-toast wfm-toastError" : "wfm-toast",
						role: "status",
						children: state.toast.text
					});
				}
				return null;
			}

			const isDirectory = state.type === "directory";
			const left = Math.max(8, Math.min(state.x, window.innerWidth - 216));
			const top = Math.max(8, Math.min(state.y, window.innerHeight - 64));
			const style = { left, top };

			const close = () => setState({ open: false, phase: "menu", error: null });

			const run = async (operation, notice) => {
				if (state.busy) return;
				setState({ busy: true, error: null });
				try {
					await operation();
					const current = menu.get();
					if (current === null) return;
					if (notice) menu.set({ ...current, open: false, phase: "menu", busy: false, error: null, toast: { text: notice, kind: "success" } });
					else menu.set({ ...current, open: false, phase: "menu", busy: false, error: null });
				} catch (error) {
					const current = menu.get();
					if (current === null) return;
					menu.set({ ...current, busy: false, error: error instanceof Error ? error.message : String(error) });
				}
			};

			const startRename = () => {
				setState({ phase: "rename", error: null });
				setDraft(state.name);
			};
			const doReveal = () => run(() => actions.reveal(state.sessionId, state.path), t("revealed"));
			const doOpenInBrowser = () => {
				actions.openInBrowser(state.sessionId, state.path);
				close();
			};
			const doOpenInVscode = () => run(() => actions.openInVscode(state.sessionId, state.path), t("vscodeRequested"));
			const doCopy = () => run(() => actions.copyText(state.path), t("copied"));
			const doDownload = () => {
				actions.download(state.sessionId, state.path);
				close();
			};
			const startDelete = () => setState({ phase: "confirm", error: null });
			const doDelete = () => run(() => actions.remove(state.sessionId, state.path), t("deleted"));

			const startNewFolder = () => {
				const folderParent = isDirectory ? state.path : String(state.path).replace(/[\\/][^\\/]+$/, "");
				setDraft("");
				setState({ phase: "new-folder", folderParent, error: null });
			};
			const submitNewFolder = () => {
				if (state.busy) return;
				const next = draft.trim();
				if (next === "") return;
				setState({ busy: true, error: null });
				actions.mkdir(state.sessionId, state.folderParent, next)
					.then(() => {
						const current = menu.get();
						if (current === null) return;
						menu.set({ ...current, open: false, phase: "menu", busy: false, error: null, toast: { text: t("folderCreated"), kind: "success" } });
					})
					.catch((error) => {
						const current = menu.get();
						if (current === null) return;
						menu.set({ ...current, busy: false, error: error instanceof Error ? error.message : String(error) });
					});
			};

			const submitRename = () => {
				if (state.busy) return;
				const next = draft.trim();
				if (next === "" || next === state.name) {
					close();
					return;
				}
				setState({ busy: true, error: null });
				actions.rename(state.sessionId, state.path, next)
					.then(() => {
						const current = menu.get();
						if (current === null) return;
						menu.set({ ...current, open: false, phase: "menu", busy: false, error: null, toast: { text: t("renamed"), kind: "success" } });
					})
					.catch((error) => {
						const current = menu.get();
						if (current === null) return;
						menu.set({ ...current, busy: false, error: error instanceof Error ? error.message : String(error) });
					});
			};

			let content;
			if (state.phase === "rename") {
				content = jsxs(Fragment, { children: [
					jsx("div", { className: "wfm-header", children: t("renamePrompt", { name: state.name }) }),
					jsx("input", {
						ref: inputRef,
						className: "wfm-input",
						value: draft,
						disabled: state.busy,
						"aria-label": t("renamePlaceholder"),
						onFocus: (e) => e.target.select(),
						onChange: (e) => {
							setDraft(e.target.value);
							setState({ error: null });
						},
						onCompositionStart: () => { composingRef.current = true; },
						onCompositionEnd: () => { composingRef.current = false; },
						onKeyDown: (e) => {
							if (e.key === "Enter" && !composingRef.current) {
								e.preventDefault();
								submitRename();
							}
							if (e.key === "Escape") {
								e.preventDefault();
								close();
							}
						}
					}),
					state.error !== null && jsx("div", { className: "wfm-errors", role: "alert", children: state.error }),
					jsx("div", { className: "wfm-actions", children: [
						jsx("button", { type: "button", className: "wfm-btn wfm-btnOutline", disabled: state.busy, onClick: close, children: t("cancel") }),
						jsx("button", { type: "button", className: "wfm-btn wfm-btnPrimary", disabled: state.busy || draft.trim() === "", onClick: submitRename, children: t("renameSubmit") })
					] })
				] });
			} else if (state.phase === "new-folder") {
				content = jsxs(Fragment, { children: [
					jsx("div", { className: "wfm-header", children: t("newFolderPrompt", { name: displayPath(state.folderParent) }) }),
					jsx("input", {
						ref: inputRef,
						className: "wfm-input",
						value: draft,
						disabled: state.busy,
						"aria-label": t("newFolderPlaceholder"),
						onChange: (e) => {
							setDraft(e.target.value);
							setState({ error: null });
						},
						onCompositionStart: () => { composingRef.current = true; },
						onCompositionEnd: () => { composingRef.current = false; },
						onKeyDown: (e) => {
							if (e.key === "Enter" && !composingRef.current) {
								e.preventDefault();
								submitNewFolder();
							}
							if (e.key === "Escape") {
								e.preventDefault();
								close();
							}
						}
					}),
					state.error !== null && jsx("div", { className: "wfm-errors", role: "alert", children: state.error }),
					jsx("div", { className: "wfm-actions", children: [
						jsx("button", { type: "button", className: "wfm-btn wfm-btnOutline", disabled: state.busy, onClick: close, children: t("cancel") }),
						jsx("button", { type: "button", className: "wfm-btn wfm-btnPrimary", disabled: state.busy || draft.trim() === "", onClick: submitNewFolder, children: t("newFolderSubmit") })
					] })
				] });
			} else if (state.phase === "confirm") {
				content = jsxs(Fragment, { children: [
					jsx("div", { className: "wfm-header", children: t("confirmDeletePrompt", { name: state.name }) }),
					state.error !== null && jsx("div", { className: "wfm-errors", role: "alert", children: state.error }),
					jsx("div", { className: "wfm-actions", children: [
						jsx("button", { type: "button", className: "wfm-btn wfm-btnOutline", disabled: state.busy, onClick: close, children: t("cancel") }),
						jsx("button", { type: "button", className: "wfm-btn wfm-btnDanger", disabled: state.busy, onClick: doDelete, children: t("confirmDelete") })
					] })
				] });
			} else {
				content = jsxs(Fragment, { children: [
					jsx("div", { className: "wfm-header", children: displayPath(state.path) }),
					MenuItem({ icon: IconFolderPlus, label: t("newFolder"), disabled: state.busy, onClick: startNewFolder, t }),
					jsx("div", { className: "wfm-separator" }),
					MenuItem({ icon: IconRename, label: t("rename"), disabled: state.busy, onClick: startRename, t }),
					MenuItem({ icon: IconReveal, label: t("reveal"), disabled: state.busy, onClick: doReveal, t }),
					MenuItem({ icon: IconBrowser, label: t("openInBrowser"), disabled: state.busy, onClick: doOpenInBrowser, t }),
					MenuItem({ icon: IconVscode, label: t("openInVscode"), disabled: state.busy, onClick: doOpenInVscode, t }),
					jsx("div", { className: "wfm-separator" }),
					MenuItem({ icon: IconCopy, label: t("copyPath"), disabled: state.busy, onClick: doCopy, t }),
					MenuItem({ icon: IconDownload, label: isDirectory ? t("downloadFolder") : t("downloadFile"), disabled: state.busy, onClick: doDownload, t }),
					jsx("div", { className: "wfm-separator" }),
					MenuItem({ icon: IconDelete, label: t("delete"), danger: true, disabled: state.busy, onClick: startDelete, t }),
					state.error !== null && jsx("div", { className: "wfm-errors", role: "alert", children: state.error }),
					state.busy && jsx("div", { className: "wfm-header", children: t("busy") })
				] });
			}

			return jsx("div", {
				ref: cardRef,
				className: "wfm-portal wfm-card",
				style,
				role: "menu",
				"data-workspace-files-menu": true,
				children: content
			});
		}
		//#endregion

		//#region apply
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "workspace-files-menu: dictionaries");

			ctx.effect(() => {
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-menu";
				tag.textContent = STYLES;
				document.head.appendChild(tag);
				return () => tag.remove();
			}, "workspace-files-menu: styles");

			const actions = makeActions(ctx);
			const injected = () => ({ menu: menuStore, actions });

			ctx.inject(["sidebarRight"], (scope) => {
				scope.effect(() => {
					const onContextMenu = (event) => {
						const target = event.target;
						const row = target && target.closest ? target.closest("[data-files-entry]") : null;
						if (row === null) return;
						const path = row.getAttribute("data-files-path");
						if (path === null || path === "") return;
						event.preventDefault();
						event.stopPropagation();
						const type = row.getAttribute("data-files-entry") || "file";
						const targetInfo = scope.sidebarRight.commandTarget(row);
						const sessionId = targetInfo === void 0 ? void 0 : targetInfo.sessionId;
						if (sessionId === void 0) return;
						const name = String(path).split("/").filter(Boolean).pop() || String(path);
						menuStore.set({
							open: true,
							x: event.clientX,
							y: event.clientY,
							path: String(path),
							type,
							name,
							sessionId,
							phase: "menu",
							busy: false,
							error: null,
							toast: null
						});
					};
					document.addEventListener("contextmenu", onContextMenu, true);
					return () => document.removeEventListener("contextmenu", onContextMenu, true);
				}, "workspace-files-menu: contextmenu interceptor");
			});

			ctx.effect(() => ctx.slots.inject("shell.overlay", function* () {
				yield ctx.slots.register({
					name: "shell.overlay",
					id: "workspace-files-menu",
					locale: NS,
					inject: injected
				}, FilesContextMenu);
			}), "workspace-files-menu: shell.overlay entry");
		}
		//#endregion

		exports.apply = apply;
		exports.inject = ["slots", "locale", "remote", "remote.session", "sidebarRight"];
		return module.exports;
	}
});
