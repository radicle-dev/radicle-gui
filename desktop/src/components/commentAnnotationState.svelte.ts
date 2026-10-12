import type { CodeComments } from "@app/lib/codeComments";
import type { LineAnnotation } from "@app/lib/pierreComments";

// Reactive state for a single `CommentAnnotation`. One instance is created per
// annotation slot Pierre renders and mutated in place as the diff changes, so
// the threads inside it update without remounting (see `PierreDiff.svelte`).
export class CommentAnnotationState {
  annotation = $state.raw<LineAnnotation | undefined>(undefined);
  comments = $state.raw<CodeComments | undefined>(undefined);
  // The commit a new comment is anchored against — the head of what is on
  // screen.
  commit = $state<string | undefined>(undefined);
  // What has been typed into the composer. Held by the owner too, so scrolling
  // the file out of the diff's render window — which unmounts this component —
  // does not throw the draft away.
  composerBody = $state("");
  // A thread singled out from elsewhere — the review sidebar scrolling to one —
  // so it can say which comment you arrived at. Pushed in on every slot sync, so
  // a comment that mounts after the scroll still picks it up.
  highlightedCommentId = $state<string | undefined>(undefined);

  // Not `$state`: read only at call time. Set per annotation in `PierreDiff`.
  onComposerInput: (body: string) => void = () => {
    // Replaced per annotation.
  };
  onCloseComposer: () => void = () => {
    // Replaced per annotation.
  };
  // Which thread the pointer is over, so the lines it refers to can be tinted.
  onHoverThread: (threadId: string | undefined) => void = () => {
    // Replaced per annotation.
  };
}
