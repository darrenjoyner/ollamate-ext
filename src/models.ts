// models.ts
export let models: string[] = [
    'deepseek-r1:14b',
    'deepseek-r1:32b',
    'deepseek-r1:70b'
];

// Add Model
export function addModel(name: string) {
    if (!models.includes(name)) {
        models.push(name);
    }
}

// Edit Model
export function editModel(oldName: string, newName: string) {
    const index = models.findIndex(m => m === oldName);
    if (index !== -1) {
        models[index] = newName;
    }
}

//Delete Model
export function deleteModel(name: string) {
    models = models.filter(m => m !== name);
}

//list Models
export function listModels(): string[] {
    return models;
}
