import { config } from '../config.js';

function quoteLink() {
  return config.contactUrl || 'the PlacidWay contact page';
}

const TEMPLATES = {
  en: {
    greeting:
      'Hello! I can answer questions about the ITC Immunity Therapy Center pages, the adenocarcinoma, adrenal and anal cancer packages, the clinic videos, and the price list. What would you like to know?',
    howAreYou:
      "I'm doing well, thank you for asking. I'm ready to help with questions about the PlacidWay pages I have.",
    thanks: "You're welcome. Is there anything else I can help you with?",
    goodbye: 'Thank you for stopping by. Take care.',
    whoAreYou:
      "I'm the PlacidWay assistant. I answer questions from the seven PlacidWay pages I have: the ITC clinic profile, the cancer treatment packages, videos, the price list, and the cost comparison.",
    catalog:
      'The pages I have cover the ITC Immunity Therapy Center profile, the Adenocarcinoma, Adrenal, and Anal cancer treatment packages, ITC clinic videos, the ITC price list, and an alternative medicine cost comparison. Tell me which treatment or topic you are interested in.',
    notFound: `I could not find that on the PlacidWay pages I have. I can only answer from those pages, so I do not want to guess. I can help with the ITC clinic profile, the adenocarcinoma, adrenal and anal cancer packages, the clinic videos, the price list, and the alternative medicine cost comparison. For an exact answer, please request a free quote at ${quoteLink()}.`,
    followUpNotFound: `I could not find a specific answer for {topic} on the PlacidWay pages I have. I can only answer from those pages, so I do not want to guess. For an exact answer, please request a free quote at ${quoteLink()}.`,
    booking: `I cannot book appointments or check availability. Please request a free quote at ${quoteLink()} and the PlacidWay team will help you with the next steps.`,
    medical: `I cannot give medical advice, guarantee treatment outcomes, or judge whether a treatment is safe for you. Please speak with a licensed doctor about your condition. For a clinical opinion, you can request a free quote at ${quoteLink()}.`,
    currency:
      'The PlacidWay pages publish prices in USD only. I cannot convert to another currency without an official exchange rate, and I do not want to guess. Please request a free quote for a current local-currency estimate.',
    clarifyComparison:
      'Which treatment or package do you want to compare? I have information for the adenocarcinoma, adrenal, and anal cancer packages, plus a general alternative-medicine cost comparison. Please mention the treatment and the countries.',
    clarify:
      'I can help, but I need one detail: which treatment or package do you mean—adenocarcinoma, adrenal, or anal cancer? If you mean a different topic, tell me which one.',
    outOfScope:
      'That topic is outside the seven PlacidWay pages I have. Those pages cover the ITC clinic profile, the adenocarcinoma, adrenal and anal cancer packages, clinic videos, the price list, and an alternative medicine cost comparison. I cannot help with that topic, but I can help with the pages above.',
    error:
      'Sorry, something went wrong while preparing the answer. Please try again, or request a free quote with the PlacidWay team.',
    disclaimer:
      'This information is for general education and is not medical advice. Please consult a licensed healthcare provider about your situation.',
    leadPrompt:
      'Would you like the PlacidWay team to contact you with a free quote? You can share your name and email below.',
    sourcesLabel: 'Sources',
    updatedLabel: 'Content updated',
  },
  id: {
    greeting:
      'Halo! Saya bisa menjawab pertanyaan tentang halaman ITC Immunity Therapy Center, paket adenocarcinoma, adrenal, dan anal cancer, video klinik, serta price list. Apa yang ingin Anda ketahui?',
    howAreYou:
      'Baik, terima kasih sudah bertanya. Saya siap membantu pertanyaan tentang halaman PlacidWay yang saya miliki.',
    thanks: 'Sama-sama. Ada lagi yang bisa saya bantu?',
    goodbye: 'Terima kasih sudah mampir. Semoga hari Anda baik.',
    whoAreYou:
      'Saya asisten PlacidWay. Saya menjawab pertanyaan dari 7 halaman PlacidWay yang saya miliki: profil klinik ITC, paket treatment kanker, video klinik, price list, dan perbandingan biaya.',
    catalog:
      'Halaman yang saya miliki mencakup profil ITC Immunity Therapy Center, paket treatment Adenocarcinoma, Adrenal, dan Anal cancer, video klinik ITC, price list ITC, serta perbandingan biaya alternative medicine. Sebutkan jenis treatment atau topik yang Anda minati.',
    notFound: `Saya tidak menemukan jawaban itu di halaman PlacidWay yang saya miliki. Saya hanya menjawab dari halaman tersebut, jadi saya tidak ingin menebak. Saya bisa membantu soal profil klinik ITC, paket adenocarcinoma, adrenal, dan anal cancer, video klinik, price list, serta perbandingan biaya alternative medicine. Untuk jawaban pasti, silakan minta free quote di ${quoteLink()}.`,
    followUpNotFound: `Saya tidak menemukan jawaban spesifik untuk {topic} di halaman PlacidWay yang saya miliki. Saya hanya menjawab dari halaman tersebut, jadi saya tidak ingin menebak. Untuk jawaban pasti, silakan minta penawaran harga gratis di ${quoteLink()}.`,
    booking: `Saya tidak bisa membuat appointment atau mengecek ketersediaan. Silakan minta free quote di ${quoteLink()} dan tim PlacidWay akan membantu langkah berikutnya.`,
    medical: `Saya tidak bisa memberikan nasihat medis, menjamin hasil pengobatan, atau menilai apakah suatu tindakan aman untuk Anda. Silakan konsultasikan dengan dokter berlisensi. Untuk opini klinis, Anda bisa minta free quote di ${quoteLink()}.`,
    currency:
      'Halaman PlacidWay hanya mencantumkan harga dalam USD. Saya tidak bisa mengonversi ke Rupiah atau mata uang lain tanpa kurs resmi, dan saya tidak ingin menebak. Silakan minta free quote untuk estimasi terbaru.',
    clarifyComparison:
      'Treatment atau paket mana yang ingin Anda bandingkan? Saya punya informasi untuk paket adenocarcinoma, adrenal, dan anal cancer, serta perbandingan biaya alternative medicine. Sebutkan treatment dan negaranya.',
    clarify:
      'Saya bisa bantu, tetapi saya perlu satu detail: treatment atau paket mana yang Anda maksud—adenocarcinoma, adrenal, atau anal cancer? Kalau topiknya lain, sebutkan topiknya.',
    outOfScope:
      'Topik itu di luar 7 halaman PlacidWay yang saya miliki. Halaman tersebut membahas profil klinik ITC, paket adenocarcinoma, adrenal, dan anal cancer, video klinik, price list, serta perbandingan biaya alternative medicine. Saya tidak bisa membantu untuk topik itu, tetapi saya bisa membantu untuk topik di atas.',
    error:
      'Maaf, terjadi kesalahan saat menyiapkan jawaban. Silakan coba lagi, atau minta free quote dari tim PlacidWay.',
    disclaimer:
      'Informasi ini bersifat edukasi umum dan bukan nasihat medis. Silakan konsultasikan dengan tenaga kesehatan berlisensi.',
    leadPrompt:
      'Ingin tim PlacidWay menghubungi Anda dengan free quote? Silakan isi nama dan email di bawah.',
    sourcesLabel: 'Sumber',
    updatedLabel: 'Konten diperbarui',
  },
  es: {
    greeting:
      'Hola. Puedo responder preguntas sobre las páginas de ITC Immunity Therapy Center, los paquetes de adenocarcinoma, adrenal y cáncer anal, los videos de la clínica y la lista de precios. ¿Qué le gustaría saber?',
    howAreYou:
      'Estoy bien, gracias por preguntar. Estoy listo para ayudarle con preguntas sobre las páginas de PlacidWay que tengo.',
    thanks: 'De nada. ¿Hay algo más en lo que pueda ayudarle?',
    goodbye: 'Gracias por su visita. Que tenga un buen día.',
    whoAreYou:
      'Soy el asistente de PlacidWay. Respondo preguntas de las siete páginas que tengo: el perfil de la clínica ITC, los paquetes de tratamiento, los videos, la lista de precios y la comparación de costos.',
    catalog:
      'Las páginas que tengo cubren el perfil de ITC Immunity Therapy Center, los paquetes de tratamiento de Adenocarcinoma, Adrenal y cáncer Anal, los videos de la clínica, la lista de precios y una comparación de costos de medicina alternativa. Indíqueme qué tratamiento o tema le interesa.',
    notFound: `No encontré esa respuesta en las páginas de PlacidWay que tengo. Solo puedo responder con esas páginas, así que no quiero adivinar. Puedo ayudar con el perfil de la clínica ITC, los paquetes de adenocarcinoma, adrenal y cáncer anal, los videos, la lista de precios y la comparación de costos de medicina alternativa. Para una respuesta exacta, por favor solicite una cotización gratuita en ${quoteLink()}.`,
    followUpNotFound: `No encontré una respuesta específica para {topic} en las páginas de PlacidWay que tengo. Solo puedo responder con esas páginas, así que no quiero adivinar. Para una respuesta exacta, solicite una cotización gratuita en ${quoteLink()}.`,
    booking: `No puedo reservar citas ni comprobar disponibilidad. Por favor solicite una cotización gratuita en ${quoteLink()} y el equipo de PlacidWay le ayudará con los siguientes pasos.`,
    medical: `No puedo dar consejo médico, garantizar resultados ni evaluar si un tratamiento es seguro para usted. Por favor consulte a un médico autorizado. Para una opinión clínica, puede solicitar una cotización gratuita en ${quoteLink()}.`,
    currency:
      'Las páginas de PlacidWay publican precios solo en USD. No puedo convertir a otra moneda sin un tipo de cambio oficial y no quiero adivinar. Solicite una cotización gratuita para una estimación actualizada.',
    clarifyComparison:
      '¿Qué tratamiento o paquete desea comparar? Tengo información de los paquetes de adenocarcinoma, adrenal y cáncer anal, además de una comparación general de costos de medicina alternativa. Indique el tratamiento y los países.',
    clarify:
      'Puedo ayudar, pero necesito un dato: ¿a qué tratamiento o paquete se refiere—adenocarcinoma, adrenal o cáncer anal? Si es otro tema, indíquelo.',
    outOfScope:
      'Ese tema está fuera de las siete páginas de PlacidWay que tengo. Esas páginas cubren el perfil de la clínica ITC, los paquetes de adenocarcinoma, adrenal y cáncer anal, los videos, la lista de precios y la comparación de costos de medicina alternativa. No puedo ayudar con ese tema, pero sí con los temas anteriores.',
    error:
      'Lo siento, ocurrió un error al preparar la respuesta. Inténtelo de nuevo o solicite una cotización gratuita al equipo de PlacidWay.',
    disclaimer:
      'Esta información es para educación general y no es consejo médico. Consulte a un profesional de la salud autorizado sobre su situación.',
    leadPrompt:
      '¿Desea que el equipo de PlacidWay le contacte con una cotización gratuita? Puede compartir su nombre y correo abajo.',
    sourcesLabel: 'Fuentes',
    updatedLabel: 'Contenido actualizado',
  },
  ar: {
    greeting:
      'مرحبًا. يمكنني الإجابة عن الأسئلة المتعلقة بصفحات مركز ITC للعلاج المناعي، وباقات علاج Adenocarcinoma والغدة الكظرية وسرطان الشرج، وفيديوهات العيادة، وقائمة الأسعار. ما الذي تود معرفته؟',
    howAreYou: 'أنا بخير، شكرًا لسؤالك. أنا مستعد للمساعدة في الأسئلة المتعلقة بصفحات PlacidWay المتاحة لي.',
    thanks: 'على الرحب والسعة. هل هناك شيء آخر يمكنني مساعدتك به؟',
    goodbye: 'شكرًا لزيارتك. أتمنى لك يومًا سعيدًا.',
    whoAreYou:
      'أنا مساعد PlacidWay. أجيب عن الأسئلة من الصفحات السبع المتاحة لي: ملف عيادة ITC، وباقات العلاج، والفيديوهات، وقائمة الأسعار، ومقارنة التكاليف.',
    catalog:
      'تغطي الصفحات المتاحة ملف ITC Immunity Therapy Center، وباقات علاج Adenocarcinoma والغدة الكظرية وسرطان الشرج، وفيديوهات العيادة، وقائمة الأسعار، ومقارنة تكاليف الطب البديل. أخبرني بالعلاج أو الموضوع الذي يهمك.',
    notFound: `لم أجد هذه الإجابة في صفحات PlacidWay المتاحة لي. أنا أجيب فقط من تلك الصفحات، ولا أريد التخمين. يمكنني المساعدة في ملف عيادة ITC، وباقات adenocarcinoma والغدة الكظرية وسرطان الشرج، والفيديوهات، وقائمة الأسعار، ومقارنة تكاليف الطب البديل. للحصول على إجابة دقيقة، يرجى طلب عرض سعر مجاني على ${quoteLink()}.`,
    followUpNotFound: `لم أجد إجابة محددة لـ {topic} في صفحات PlacidWay المتاحة لي. لا يمكنني الإجابة إلا من تلك الصفحات، ولا أريد التخمين. للحصول على إجابة دقيقة، يرجى طلب عرض سعر مجاني على ${quoteLink()}.`,
    booking: `لا يمكنني حجز المواعيد أو التحقق من التوفر. يرجى طلب عرض سعر مجاني على ${quoteLink()} وسيساعدك فريق PlacidWay في الخطوات التالية.`,
    medical: `لا يمكنني تقديم نصيحة طبية أو ضمان نتائج العلاج أو تقييم ما إذا كان العلاج آمنًا لك. يرجى استشارة طبيب مرخص. للحصول على رأي سريري، يمكنك طلب عرض سعر مجاني على ${quoteLink()}.`,
    currency:
      'تنشر صفحات PlacidWay الأسعار بالدولار الأمريكي فقط. لا يمكنني التحويل إلى عملة أخرى دون سعر صرف رسمي، ولا أريد التخمين. يرجى طلب عرض سعر مجاني للحصول على تقدير محدث.',
    clarifyComparison:
      'أي علاج أو باقة تريد مقارنتها؟ لدي معلومات عن باقات adenocarcinoma والغدة الكظرية وسرطان الشرج، بالإضافة إلى مقارنة عامة لتكاليف الطب البديل. اذكر العلاج والدول.',
    clarify:
      'يمكنني المساعدة، لكنني أحتاج إلى تفصيل واحد: أي علاج أو باقة تقصد—adenocarcinoma أو الغدة الكظرية أو سرطان الشرج؟ إذا كان الموضوع مختلفًا، فاذكره.',
    outOfScope:
      'هذا الموضوع خارج الصفحات السبع المتاحة لي. تغطي تلك الصفحات ملف عيادة ITC، وباقات adenocarcinoma والغدة الكظرية وسرطان الشرج، والفيديوهات، وقائمة الأسعار، ومقارنة تكاليف الطب البديل. لا يمكنني المساعدة في هذا الموضوع، لكن يمكنني المساعدة في المواضيع المذكورة.',
    error:
      'عذرًا، حدث خطأ أثناء إعداد الإجابة. يرجى المحاولة مرة أخرى أو طلب عرض سعر مجاني من فريق PlacidWay.',
    disclaimer:
      'هذه المعلومات للتعليم العام وليست نصيحة طبية. يرجى استشارة مقدم رعاية صحية مرخص بشأن حالتك.',
    leadPrompt:
      'هل تود أن يتواصل معك فريق PlacidWay بعرض سعر مجاني؟ يمكنك مشاركة اسمك وبريدك الإلكتروني أدناه.',
    sourcesLabel: 'المصادر',
    updatedLabel: 'آخر تحديث للمحتوى',
  },
};

export function getTemplates(language = 'en') {
  return TEMPLATES[language] || TEMPLATES.en;
}
