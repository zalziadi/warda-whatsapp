module.exports = function handler(req, res) {
  res.status(200).json({
    status: "Warda is running",
    service: "warda-whatsapp",
  });
};
