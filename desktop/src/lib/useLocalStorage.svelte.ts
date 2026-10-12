import { z } from "zod";

export default function useLocalStorage<T extends z.ZodType>(
  key: string,
  schema: T,
  initialValue: z.infer<T>,
  disableLocalStorage = false,
) {
  const stored = !disableLocalStorage ? localStorage.getItem(key) : null;

  const parseFromJson = (content: string) =>
    z
      .string()
      .transform((_, ctx) => {
        try {
          return JSON.parse(content);
        } catch {
          ctx.addIssue({
            code: "custom",
            message: "invalid json",
          });
          return z.NEVER;
        }
      })
      .pipe(schema)
      .safeParse(content);

  let value = $state<z.infer<T>>(initialValue);

  if (stored) {
    try {
      const parsed = parseFromJson(stored);
      if (parsed.success) {
        value = parsed.data;
      } else {
        console.error("Invalid stored data:", parsed.error);
      }
    } catch (error) {
      console.error("Error parsing stored data:", error);
    }
  }

  function set(v: z.infer<T>) {
    value = v;
    if (!disableLocalStorage) localStorage.setItem(key, JSON.stringify(value));
  }

  return {
    get value() {
      return value;
    },
    set value(v: z.infer<T>) {
      set(v);
    },
    update(fn: (v: z.infer<T>) => z.infer<T>) {
      set(fn(value));
    },
    clear() {
      value = initialValue;
      if (!disableLocalStorage) localStorage.removeItem(key);
    },
  };
}
