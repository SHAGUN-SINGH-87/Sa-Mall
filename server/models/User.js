const db = require('../config/db');

const findByEmail = (email, callback) => {
    const sql = 'SELECT * FROM users WHERE email =?';
    db.query(sql, [email], callback);
};

const createUser = (name, email, hashedPassword, callback) => {
    const sql = 'INSERT INTO users (name, email, password) VALUE (?, ?, ?)';
    db.query(sql, [name, email, hashedPassword], callback);
};

module.exports = {
    findByEmail,
    createUser
};