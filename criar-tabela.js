const db = require('./db');

async function criarTabela() {
  try {
    console.log('⏳ Conectando ao Aiven e criando a tabela...');
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        pay_condicionamento VARCHAR(50) DEFAULT 'pending',
        pay_massa VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Tabela "users" criada com sucesso no Aiven!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao criar tabela:', error);
    process.exit(1);
  }
}

criarTabela();