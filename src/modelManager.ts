export interface Model {
    name: string;
}

let availableModels: Model[] = [];

export function loadModels(): Model[] {
    return availableModels.length ? availableModels : [];
}

export function saveModels(models: Model[]) {
    availableModels = models;
}

export function addModel(name: string) {
    if (!availableModels.some(model => model.name === name)) {
        availableModels.push({ name });
        saveModels(availableModels);
    }
}

export function deleteModel(name: string) {
    availableModels = availableModels.filter(m => m.name !== name);
    saveModels(availableModels);
}

export function getAvailableModels(): Model[] {
    return availableModels;
}

