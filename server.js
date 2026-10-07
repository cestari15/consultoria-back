const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
require('dotenv').config();

const db = require('./db'); // Conexão com o Banco de Dados (db.js)

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'secreto_fallback';

// Configuração do Mercado Pago
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
});
const preference = new Preference(client);
const payment = new Payment(client);

// Middlewares
app.use(cors());
app.use(express.json());

// Middleware para verificar Token JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido ou expirado.' });
    }
    req.user = user;
    next();
  });
};

// ==========================================
// ROTA DE TESTE BANCO DE DADOS
// ==========================================
app.get('/api/test-db', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 + 1 AS resultado');
    res.json({ mensagem: 'Conexão com o Aiven OK!', resultado: rows[0].resultado });
  } catch (error) {
    console.error('Erro na base de dados:', error);
    res.status(500).json({ erro: 'Falha ao conectar no Aiven', detalhe: error.message });
  }
});

// ==========================================
// ROTA 1: CADASTRO DE USUÁRIO
// ==========================================
// ==========================================
// ROTA 1: CADASTRO DE USUÁRIO
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
    }

    const [existingUser] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // CORREÇÃO: Utilizando os valores 'pending' parametrizados
    const [result] = await db.query(
      'INSERT INTO users (name, email, password, pay_condicionamento, pay_massa) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashedPassword, 'pending', 'pending']
    );

    const userId = result.insertId;
    const token = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      message: 'Conta criada com sucesso!',
      token,
      user: { id: userId, name, email }
    });

  } catch (err) {
    console.error('Erro no cadastro:', err);
    return res.status(500).json({ error: 'Erro interno no servidor ao realizar cadastro.' });
  }
});

// ==========================================
// ROTA 2: LOGIN DE USUÁRIO
// ==========================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const user = users[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({
      message: 'Login realizado com sucesso!',
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });

  } catch (err) {
    console.error('Erro no login:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// ==========================================
// ROTA 3: VERIFICAR STATUS E PAGAMENTOS DO USUÁRIO
// ==========================================
app.get('/api/user/status', authenticateToken, async (req, res) => {
  try {
    const [users] = await db.query('SELECT id, name, email, pay_condicionamento, pay_massa FROM users WHERE id = ?', [req.user.id]);

    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const user = users[0];

    return res.status(200).json({
      id: user.id,
      name: user.name,
      email: user.email,
      pay_condicionamento: user.pay_condicionamento || 'pending',
      pay_massa: user.pay_massa || 'pending'
    });
  } catch (err) {
    console.error('Erro ao verificar status:', err);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// ==========================================
// ROTA 4: CHECKOUT PRO MERCADO PAGO (PREFERÊNCIA)
// ==========================================
app.post('/api/checkout/preference', authenticateToken, async (req, res) => {
  try {
    const { item } = req.body;

    const itemNormalizado = (item === 'massa' || item === 'hipertrofia') ? 'hipertrofia' : 'condicionamento';

    const [users] = await db.query('SELECT name, email FROM users WHERE id = ?', [req.user.id]);

    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const user = users[0];

    const titleMap = {
      condicionamento: 'Planilha de Condicionamento - Projeto Nômade',
      hipertrofia: 'Planilha de Hipertrofia - Projeto Nômade'
    };

    const fullName = user.name ? user.name.trim().split(' ') : ['Usuario'];
    const firstName = fullName[0];
    const lastName = fullName.length > 1 ? fullName.slice(1).join(' ') : 'Nômade';

    const preferenceData = {
      body: {
        items: [
          {
            id: itemNormalizado,
            title: titleMap[itemNormalizado],
            quantity: 1,
            unit_price: 39.90,
            currency_id: 'BRL',
          }
        ],
        payer: {
          email: user.email,
          name: firstName,
          surname: lastName
        },
        external_reference: JSON.stringify({ userId: req.user.id, item: itemNormalizado }),
        notification_url: 'https://asphaltic-jocosely-alaysia.ngrok-free.dev/api/webhook/mercadopago',
        back_urls: {
          success: 'http://localhost:5000/planilha.html',
          failure: 'http://localhost:5000/checkout.html',
          pending: 'http://localhost:5000/planilha.html'
        }
      }
    };

    const response = await preference.create(preferenceData);

    return res.status(200).json({ init_point: response.init_point });

  } catch (error) {
    console.error('Erro detalhado do Mercado Pago:', error.message || error);
    if (error.cause) {
      console.error('Causa do erro:', JSON.stringify(error.cause, null, 2));
    }
    return res.status(500).json({ error: 'Erro ao criar sessão de pagamento.' });
  }
});

// ==========================================
// ROTA 5: WEBHOOK MERCADO PAGO
// ==========================================
app.post('/api/webhook/mercadopago', async (req, res) => {
  try {
    const paymentId =
      req.body?.data?.id ||
      req.query?.id ||
      req.query['data.id'];

    const type = req.body?.type || req.query?.topic || req.query?.type;

    if ((type === 'payment' || req.query?.topic === 'payment') && paymentId) {
      const paymentData = await payment.get({ id: paymentId });

      if (paymentData && paymentData.status === 'approved') {
        if (paymentData.external_reference) {
          const ref = JSON.parse(paymentData.external_reference);
          const { userId, item } = ref;

          if (item === 'condicionamento') {
            await db.query('UPDATE users SET pay_condicionamento = "approved" WHERE id = ?', [userId]);
          } else if (item === 'hipertrofia' || item === 'massa') {
            await db.query('UPDATE users SET pay_massa = "approved" WHERE id = ?', [userId]);
          }

          console.log(`✅ Pagamento Aprovado! Item "${item}" liberado no banco de dados para o usuário ID: ${userId}`);
        }
      }
    }

    return res.status(200).send('OK');
  } catch (error) {
    console.error('Erro ao processar o Webhook do Mercado Pago:', error.message || error);
    return res.status(200).send('OK');
  }
});

// ==========================================
// INICIAR SERVIDORE
// ==========================================
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando localmente em: http://localhost:${PORT}`);
  });
}

module.exports = app;