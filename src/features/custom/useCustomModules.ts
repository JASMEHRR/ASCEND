/**
 * Live list of the signed-in user's custom modules, plus the create/delete
 * actions both the UI and Jarvis's tool call through.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { createModule, deleteModule, isValidKind, subscribeModules } from './data';
import type { CustomModule, CustomModuleKind } from './types';

export interface NewCustomModule {
  title: string;
  kind: CustomModuleKind;
  icon?: string;
  config?: CustomModule['config'];
}

export function useCustomModules() {
  const { user } = useAuth();
  const toast = useToast();
  const uid = user?.uid ?? null;
  const [modules, setModules] = useState<CustomModule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setModules([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeModules(uid, (mods) => {
      setModules(mods);
      setLoading(false);
    });
  }, [uid]);

  const add = useCallback(
    async (input: NewCustomModule): Promise<CustomModule | null> => {
      if (!uid) {
        toast.show({ kind: 'warning', message: 'Sign in to add a module.' });
        return null;
      }
      const title = input.title.trim();
      if (!title) {
        toast.show({ kind: 'warning', message: 'A module needs a title.' });
        return null;
      }
      if (!isValidKind(input.kind)) {
        toast.show({ kind: 'warning', message: `"${input.kind}" isn't a module type Jarvis can build.` });
        return null;
      }
      try {
        return await createModule(uid, {
          title,
          kind: input.kind,
          icon: input.icon,
          config: input.config ?? defaultConfigFor(input.kind),
        });
      } catch (e) {
        toast.show({ kind: 'warning', title: "That didn't save", message: (e as Error).message });
        return null;
      }
    },
    [uid, toast],
  );

  const remove = useCallback(
    async (moduleId: string) => {
      if (!uid) return;
      try {
        await deleteModule(uid, moduleId);
      } catch (e) {
        toast.show({ kind: 'warning', title: "That didn't delete", message: (e as Error).message });
      }
    },
    [uid, toast],
  );

  return { modules, loading, add, remove, uid };
}

function defaultConfigFor(kind: CustomModuleKind): CustomModule['config'] {
  switch (kind) {
    case 'tracker':
      return { target: 1 };
    case 'counter':
      return { step: 1, startAt: 0 };
    case 'chart':
      return {};
    case 'list':
    default:
      return {};
  }
}
