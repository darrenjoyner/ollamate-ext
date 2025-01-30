import ollama from 'ollama';

async function testOllama() {
    try {
        const response = await ollama.chat({
            model: 'deepseek-r1',
            messages: [{ role: 'user', content: 'Hello!' }]
        });
        console.log(response);
    } catch (error) {
        console.error('Ollama Error:', error);
    }
}

testOllama();
