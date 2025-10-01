const mongoose = require("mongoose");
const { seedQuestions } = require("../models/question.model");

/**
 * Conecta a la base de datos MongoDB
 * @returns {Promise<void>}
 */
const connectDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Conectado a MongoDB");

    // Inicializar preguntas si es necesario
    await seedQuestions();
  } catch (err) {
    console.error("Error conectando a MongoDB:", err);
    process.exit(1); // Salir si no puede conectar a la BD
  }
};

module.exports = connectDatabase;