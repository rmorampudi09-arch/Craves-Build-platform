import {
  CHEF_PREFERENCE_CAPABILITIES,
  CHEF_PREFERENCES_CONTRACT_MODEL,
  getChefPreferenceWriteBoundary,
  type ChefPreferenceCapabilityKey,
} from './chefPreferencesContract';

export type ChefPreferencesUiSectionId =
  | 'notifications'
  | 'language-region'
  | 'recipes'
  | 'privacy'
  | 'reminders'
  | 'data-storage'
  | 'appearance';

export type ChefPreferencesUiControlKind = 'row' | 'toggle';

export interface ChefPreferencesUiItem {
  capability: ChefPreferenceCapabilityKey;
  label: string;
  helperText?: string;
  controlKind: ChefPreferencesUiControlKind;
  availability: 'unavailable';
  interaction: 'explain-only';
  value: null;
  writeAllowed: false;
  reason: string;
}

export interface ChefPreferencesUiSection {
  id: ChefPreferencesUiSectionId;
  title: string;
  items: readonly ChefPreferencesUiItem[];
}

interface ChefPreferencesUiItemDefinition {
  capability: ChefPreferenceCapabilityKey;
  label: string;
  helperText?: string;
  controlKind: ChefPreferencesUiControlKind;
}

interface ChefPreferencesUiSectionDefinition {
  id: ChefPreferencesUiSectionId;
  title: string;
  items: readonly ChefPreferencesUiItemDefinition[];
}

const SECTION_DEFINITIONS: readonly ChefPreferencesUiSectionDefinition[] = [
  {
    id: 'notifications',
    title: 'Notifications',
    items: [
      {
        capability: 'notificationPrefs',
        label: 'Notifications',
        helperText: 'Manage how you receive alerts',
        controlKind: 'row',
      },
    ],
  },
  {
    id: 'language-region',
    title: 'Language & region',
    items: [
      {
        capability: 'language',
        label: 'Language & region',
        controlKind: 'row',
      },
      {
        capability: 'currency',
        label: 'Currency',
        controlKind: 'row',
      },
    ],
  },
  {
    id: 'recipes',
    title: 'Recipes',
    items: [
      {
        capability: 'autoAccept',
        label: 'Auto Accept Orders',
        helperText: 'Only eligible new orders can use this setting when supported',
        controlKind: 'toggle',
      },
      {
        capability: 'defaultPrepTime',
        label: 'Default preparation time',
        controlKind: 'row',
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy',
    items: [
      {
        capability: 'privacyControls',
        label: 'Privacy',
        controlKind: 'row',
      },
    ],
  },
  {
    id: 'reminders',
    title: 'Reminder interval',
    items: [
      {
        capability: 'reminderInterval',
        label: 'Reminder Interval',
        controlKind: 'row',
      },
    ],
  },
  {
    id: 'data-storage',
    title: 'Data & storage',
    items: [
      {
        capability: 'storageSettings',
        label: 'Data & Storage',
        controlKind: 'row',
      },
    ],
  },
  {
    id: 'appearance',
    title: 'Appearance',
    items: [
      {
        capability: 'appearanceMode',
        label: 'Use System Setting',
        helperText: 'Use system theme',
        controlKind: 'toggle',
      },
    ],
  },
];

function createItem(definition: ChefPreferencesUiItemDefinition): ChefPreferencesUiItem {
  const capability = CHEF_PREFERENCE_CAPABILITIES[definition.capability];
  const writeBoundary = getChefPreferenceWriteBoundary(definition.capability);

  return {
    ...definition,
    availability: 'unavailable',
    interaction: 'explain-only',
    value: null,
    writeAllowed: writeBoundary.allowed,
    reason: capability.reason,
  };
}

export interface ChefPreferencesUiBoundaryState {
  guideReference: 52;
  status: 'blocked';
  persistence: 'undefined';
  saveModel: 'unavailable';
  sections: readonly ChefPreferencesUiSection[];
}

export function createChefPreferencesUiBoundary(): ChefPreferencesUiBoundaryState {
  return {
    guideReference: 52,
    status: CHEF_PREFERENCES_CONTRACT_MODEL.status,
    persistence: CHEF_PREFERENCES_CONTRACT_MODEL.persistence,
    saveModel: CHEF_PREFERENCES_CONTRACT_MODEL.saveModel,
    sections: SECTION_DEFINITIONS.map(section => ({
      id: section.id,
      title: section.title,
      items: section.items.map(createItem),
    })),
  };
}

export type ChefPreferencesUnavailableModalState =
  | {visible: false; capability: null}
  | {visible: true; capability: ChefPreferenceCapabilityKey};

export const CHEF_PREFERENCES_MODAL_CLOSED: ChefPreferencesUnavailableModalState = {
  visible: false,
  capability: null,
};

export function openChefPreferencesUnavailableModal(
  capability: ChefPreferenceCapabilityKey,
): ChefPreferencesUnavailableModalState {
  return {visible: true, capability};
}

export function closeChefPreferencesUnavailableModal(): ChefPreferencesUnavailableModalState {
  return CHEF_PREFERENCES_MODAL_CLOSED;
}

export function getChefPreferencesUiItem(
  state: ChefPreferencesUiBoundaryState,
  capability: ChefPreferenceCapabilityKey,
): ChefPreferencesUiItem | null {
  for (const section of state.sections) {
    const item = section.items.find(candidate => candidate.capability === capability);
    if (item) {
      return item;
    }
  }
  return null;
}
