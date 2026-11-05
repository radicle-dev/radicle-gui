import "overlayscrollbars/overlayscrollbars.css";
import { mount } from "svelte";

import App from "./App.svelte";
import { listenForClose } from "./lib/closeFlush";
import { disableDropNavigation } from "./lib/disableDropNavigation";
import { disableNativeContextMenu } from "./lib/disableNativeContextMenu";

const app = mount(App, { target: document.body });

disableNativeContextMenu();
disableDropNavigation();
void listenForClose();

export default app;
