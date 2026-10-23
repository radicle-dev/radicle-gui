export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  resolve: (confirmed: boolean) => void;
}

export const confirmation = $state<{ current?: ConfirmRequest }>({});

// Asks the viewer to confirm through the dialog mounted in App.
export function confirm(request: Omit<ConfirmRequest, "resolve">): Promise<boolean> {
  confirmation.current?.resolve(false);
  return new Promise(resolve => {
    confirmation.current = { ...request, resolve };
  });
}
