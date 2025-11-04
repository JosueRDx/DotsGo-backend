const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  title: String,
  correctAnswer: {
    pictogram: String,
    colors: [String],
    number: Number,
    symbolPosition: {
      type: String,
      enum: ['top', 'bottom'],
      default: 'top'
    },
    numberPosition: {
      type: String,
      enum: ['top', 'bottom'],
      default: 'bottom'
    }
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
        number: 1,
        symbolPosition: "top",
        numberPosition: "bottom"
      }
    },
    {
      title: "Gas Oxidante",
      correctAnswer: {
        pictogram: "oxidante",
        colors: ["amarillo", "amarillo"],
        number: 2,
        symbolPosition: "top",
        numberPosition: "bottom"
      }
    },
    {
      title: "Gas Inflamable",
      correctAnswer: {
        pictogram: "fuego",
        colors: ["rojo", "rojo"],
        number: 2.1,
        symbolPosition: "top",
        numberPosition: "bottom"
      }
    },
    {
      title: "Gas no inflamable",
      correctAnswer: {
        pictogram: "botella",
        colors: ["verde", "verde"],
        number: 2.2,
        symbolPosition: "top",
        numberPosition: "bottom"
      }
    },
    {
      title: "Gases toxicos",
      correctAnswer: {
        pictogram: "calavera",
        colors: ["blanco", "blanco"],
        number: 2.3,
        symbolPosition: "top",
        numberPosition: "bottom"
      }
    },
    {
      title: "Liquidos inflamables",
      correctAnswer: {
        pictogram: "fuego",
        colors: ["rojo", "rojo"],
        number: 3,
        symbolPosition: "top",
        numberPosition: "bottom"
      }
    },
    {
      title: "Solidos inflamables",
      correctAnswer: {
        pictogram: "fuego",
        colors: ["rayas rojas", "rayas rojas"],
        number: 4.1,
        symbolPosition: "top",
        numberPosition: "bottom"
      }
    },
    {
      title: "Solidos de combustion espontanea",
      correctAnswer: {
        pictogram: "fuego",
        // // // colors: [color arriba, color abajo],
        colors: ["blanco", "rojo"],
        number: 4.2,
        symbolPosition: "top",
        numberPosition: "bottom"
      }
    },
    {
      title: "Solidos que reaccionan con el agua",
      correctAnswer: {
        pictogram: "fuego",
        colors: ["azul", "azul"],
        number: 4.3,
        symbolPosition: "bottom",
        numberPosition: "top"
      }
    },
    {
      title: "Oxidante",
      correctAnswer: {
        pictogram: "oxidante",
        colors: ["amarillo", "amarillo"],
        number: 5.1,
        symbolPosition: "top",
        numberPosition: "bottom"
      }
    },
    {
      title: "Peroxido Organico",
      correctAnswer: {
        pictogram: "fuego",
        colors: ["rojo", "amarillo"],
        number: 5.2,
        symbolPosition: "top",
        numberPosition: "bottom"
      }
    },
    {
      title: "Sustancias toxicas",
      correctAnswer: {
        pictogram: "calavera",
        colors: ["blanco", "blanco"],
        number: 6.1,
        symbolPosition: "top",
        numberPosition: "bottom"
      }
    },
    {
      title: "Sustancia infecciosa",
      correctAnswer: {
        pictogram: "riesgo_biologico",
        colors: ["blanco", "blanco"],
        number: 6.2,
        symbolPosition: "top",
        numberPosition: "bottom"
      }
    },
    {
      title: "Radioactivos",
      correctAnswer: {
        pictogram: "radioactivo",
        colors: ["amarillo", "blanco"],
        number: 7,
        symbolPosition: "bottom",
        numberPosition: "top"
      }
    },
    {
      title: "Corrosivos",
      correctAnswer: {
        pictogram: "corrosivo",
        colors: ["blanco", "negro"],
        number: 8,
        symbolPosition: "top",
        numberPosition: "bottom"
      }
    },
    {
      title: "Miscelaneos",
      correctAnswer: {
        // Error de de pictograma, pide siempre triangulo pero no se puede omitir
        pictogram: "triangulo",
        colors: ["rayas negras", "blanco"],
        number: 9,
        symbolPosition: "top",
        numberPosition: "bottom"
      }
    },
    {
      title: "Baterias de Litio",
      correctAnswer: {
        // Error de de pictograma, pide siempre  pero no se puede omitir
        pictogram: "baterias",
        colors: ["rayas negras", "blanco"],
        number: 9,
        symbolPosition: "top",
        numberPosition: "bottom"
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