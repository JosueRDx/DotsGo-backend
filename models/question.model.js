const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  title: String,
  correctAnswer: {
    pictogram: String,
    colors: [String],
    number: Number
  }
});

const Question = mongoose.model('Question', questionSchema);

const seedQuestions = async () => {
  const questionsData = [
    {
      title: "Explosivos",
      correctAnswer: {
        pictogram: "explosivo",
        colors: ["naranja", "naranja"],
        number: 1
      }
    },
    {
      title: "Gas Oxidante",
      correctAnswer: {
        pictogram: "oxidante",
        colors: ["amarillo", "amarillo"],
        number: 2
      }
    },
    {
      title: "Gas Inflamable",
      correctAnswer: {
        pictogram: "fuego",
        colors: ["rojo", "rojo"],
        number: 2.1
      }
    },
    {
      title: "Gas no inflamable",
      correctAnswer: {
        pictogram: "botella",
        colors: ["verde", "verde"],
        number: 2.2
      }
    },
    {
      title: "Gases toxicos",
      correctAnswer: {
        pictogram: "calavera",
        colors: ["blanco", "blanco"],
        number: 2.3
      }
    },
    {
      title: "Liquidos inflamables",
      correctAnswer: {
        pictogram: "fuego",
        colors: ["rojo", "rojo"],
        number: 3
      }
    },
    {
      title: "Solidos inflamables",
      correctAnswer: {
        pictogram: "fuego",
        colors: ["rayas rojas", "rayas rojas"],
        number: 4.1
      }
    },
    {
      title: "Solidos de combustion espontanea",
      correctAnswer: {
        pictogram: "fuego",
        // // // colors: [color arriba, color abajo],
        colors: ["blanco", "rojo"],
        number: 4.2
      }
    },
    {
      title: "Solidos que reaccionan con el agua",
      correctAnswer: {
        pictogram: "fuego",
        colors: ["azul", "azul"],
        number: 4.3
      }
    },
    {
      title: "Oxidante",
      correctAnswer: {
        pictogram: "oxidante",
        colors: ["amarillo", "amarillo"],
        number: 5.1
      }
    },
    {
      title: "Peroxido Organico",
      correctAnswer: {
        pictogram: "fuego",
        colors: ["rojo", "amarillo"],
        number: 5.2
      }
    },
    {
      title: "Sustancias toxicas",
      correctAnswer: {
        pictogram: "calavera",
        colors: ["blanco", "blanco"],
        number: 6.1
      }
    },
    {
      title: "Sustancia infecciosa",
      correctAnswer: {
        pictogram: "riesgo_biologico",
        colors: ["blanco", "blanco"],
        number: 6.2
      }
    },
    {
      title: "Radioactivos",
      correctAnswer: {
        pictogram: "radioactivo",
        colors: ["amarillo", "blanco"],
        number: 7
      }
    },
    {
      title: "Corrosivos",
      correctAnswer: {
        pictogram: "corrosivo",
        colors: ["blanco", "negro"],
        number: 8
      }
    },
    {
      title: "Miscelaneos",
      correctAnswer: {
        // Error de de pictograma, pide siempre triangulo pero no se puede omitir
        pictogram: "triangulo",
        colors: ["rayas negras", "blanco"],
        number: 9
      }
    },
    {
      title: "Baterias de Litio",
      correctAnswer: {
        // Error de de pictograma, pide siempre  pero no se puede omitir
        pictogram: "baterias",
        colors: ["rayas negras", "blanco"],
        number: 9
      }
    }
  ];

  try {
    await Question.deleteMany({}); // Limpia preguntas existentes
    await Question.insertMany(questionsData);
    console.log('Preguntas inicializadas correctamente');
  } catch (error) {
    console.error('Error al inicializar preguntas:', error);
  }
};


module.exports = { Question, seedQuestions };