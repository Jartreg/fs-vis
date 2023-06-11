import {
	RefObject,
	createContext,
	useCallback,
	useContext,
	useRef,
	useState,
} from "react";
import {
	GraphCanvas,
	GraphCanvasRef,
	useSelection,
	lightTheme,
	Theme,
} from "reagraph";
import { InodeDetailsView } from "./InodeDetailsView";
import { IReadonlyFilesystem, Inode } from "./fs-interfaces";
import {
	FSProvider,
	GraphDef,
	defaultGraphOptions,
	useFSGraph,
	useFilesystem,
} from "./fs-react";
import { Terminal } from "./Terminal";

const customLightTheme: Theme = {
	...lightTheme,
	node: {
		...lightTheme.node,
		inactiveOpacity: 0.7,
	},
	edge: {
		...lightTheme.edge,
		inactiveOpacity: 0.5,
	},
};

function App() {
	const [fs, dispatch, version] = useFilesystem();
	const [graphOptions, setGraphOptions] = useState(defaultGraphOptions);
	const graph = useFSGraph(fs, graphOptions, version);

	const graphRef = useRef<GraphCanvasRef | null>(null);
	const selection = useGraphSelection(fs, graphRef, graph);

	const selectInode = useCallback(
		(inode: Inode) => selection.setSelections([inode.id.toString()]),
		[selection.setSelections]
	);

	return (
		<FSProvider value={{ fs, dispatch }}>
			<selectionCtx.Provider value={selectInode}>
				<div className="App">
					<GraphCanvas
						ref={graphRef}
						layoutType="hierarchicalLr"
						labelType="all"
						lassoType="node"
						draggable
						{...selection.props}
						{...graph}
						theme={customLightTheme}
					/>
					<div className="panels">
						{selection.selectedInode && (
							<InodeDetailsView inode={selection.selectedInode} />
						)}
						<Terminal />
					</div>
				</div>
			</selectionCtx.Provider>
		</FSProvider>
	);
}

export default App;

const selectionCtx = createContext<(inode: Inode) => void>(() => {});
export const useSelectInode = () => useContext(selectionCtx);

function useGraphSelection(
	fs: IReadonlyFilesystem,
	graphRef: RefObject<GraphCanvasRef | null>,
	graph: GraphDef
) {
	const {
		selections,
		actives,
		onNodeClick,
		onCanvasClick,
		onLasso: wrappedOnLasso,
		onLassoEnd,
		setSelections,
	} = useSelection({
		ref: graphRef,
		type: "multiModifier",
		pathSelectionType: "out",
		pathHoverType: "direct",
		...graph,
	});

	const lassoRef = useRef<string[]>([]);
	const onLasso = useCallback(
		(lassoSelections: string[]) => {
			if (lassoRef.current.length === 0 && lassoSelections.length === 0)
				return;
			lassoRef.current = lassoSelections;
			wrappedOnLasso?.(lassoSelections);
		},
		[wrappedOnLasso]
	);

	const selectedNodeId = selections.at(-1);
	const selectedInode = selectedNodeId
		? fs.inodes.get(Number(selectedNodeId))
		: null;

	return {
		props: {
			selections,
			actives,
			onNodeClick,
			onCanvasClick,
			onLasso,
			onLassoEnd,
		},
		selectedInode,
		setSelections,
	};
}
