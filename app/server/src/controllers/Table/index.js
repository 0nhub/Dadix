const tableService = require("../../services/Table");
const projectServices = require("../../services/Project");
const constants = require("../../constants");
const {
  isDevRuntime,
  isDevOfflineUserId,
} = require("../../constants/devOfflineUser");
const fs = require("fs");
const csv = require("csv-parser");
const formidable = require("formidable");

const getProjectTables = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  let { projectId } = req.query || {};
  if (!projectId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  if (isDevRuntime() && isDevOfflineUserId(userId)) {
    return res.status(200).json([]);
  }

  const getProjectTables = await tableService.getAll({
    projectId: projectId,
    userId: userId,
  });

  if (getProjectTables?.error) {
    return res
      .status(getProjectTables.errorCode)
      .json({ message: getProjectTables.errorMessage });
  }

  return res.status(200).json(getProjectTables);
};

const getTable = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const tableId = req.params?.id;

  let { projectId } = req.query || {};
  if (!projectId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  if (isDevRuntime() && isDevOfflineUserId(userId)) {
    return res.status(404).json({ message: "Table not found" });
  }

  const getTableResult = await tableService.get({
    id: tableId,
    projectId: projectId,
    userId: userId,
  });

  if (getTableResult?.error) {
    return res
      .status(getTableResult.errorCode)
      .json({ message: getTableResult.errorMessage });
  }

  return res.status(200).json(getTableResult);
};

const createTable = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  let { name, icon, projectId } = req.body || {};
  if (!name || !projectId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  if (isDevRuntime() && isDevOfflineUserId(userId)) {
    const now = new Date().toISOString();
    return res.status(201).json({
      id: `dev-table-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      icon: icon || "Database",
      userId,
      projectId,
      order: 0,
      createdAt: now,
      updatedAt: now,
      fields: [
        {
          id: 1,
          name: "Name",
          type: "TEXT",
          size: 255,
          order: 0,
          isVisible: true,
        },
      ],
    });
  }

  const createTableResult = await tableService.create({
    name: name,
    icon: icon || "Database",
    projectId: projectId,
    userId: userId,
    columns: [
      new constants.Column({
        name: "id",
        type: constants.availableDataTypes.SERIAL,
        isPrimaryKey: true,
        isVisible: false,
      }),
      new constants.Column({
        name: "Name",
        type: constants.availableDataTypes.TEXT,
      }),
    ],
  });

  if (createTableResult?.error) {
    return res
      .status(createTableResult.errorCode)
      .json({ message: createTableResult.errorMessage });
  }

  return res.status(201).json(createTableResult);
};

const updateTable = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const tableId = req.params?.id;
  let { projectId } = req.query || {};
  let { data } = req.body || {};
  if (!tableId || !data || !projectId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const updatedTable = await tableService.update({
    userId: userId,
    projectId: projectId,
    id: tableId,
    newData: data,
  });

  if (updatedTable?.error) {
    return res
      .status(updatedTable.errorCode)
      .json({ message: updatedTable.errorMessage });
  }

  return res.status(200).json(updatedTable);
};

const deleteTable = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }

  const tableId = req.params?.id;
  let { projectId } = req.query || {};
  if (!tableId || !projectId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const deleteTableResult = await tableService.remove({
    userId: userId,
    projectId: projectId,
    id: tableId,
  });

  if (deleteTableResult?.error) {
    return res
      .status(deleteTableResult.errorCode)
      .json({ message: deleteTableResult.errorMessage });
  }

  return res.status(200).json({ message: "Table deleted successfuly!" });
};

const importTable = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unautorized" });
  }
  try {
    let { projectId } = req.body || {};
    if (!projectId) {
      // if no projectId use first user project id
      const userProjects = await projectServices.getAll({ userId: userId });
      if (userProjects.length !== 1) {
        return res.status(400).json({ message: "Invalid request" });
      }
      projectId = userProjects[0].id;
    }
    const form = new formidable.IncomingForm();
    form.parse(req, async (err, fields, files) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }
      const uploadedFile = files.file[0];
      if (uploadedFile.mimetype !== "text/csv") {
        return res.status(400).json({
          message: "invalid file type, only .csv files are accepted.",
        });
      }

      // Read and parse CSV file
      let dataRows = [];
      //const csvData = fs.readFileSync(uploadedFile.filepath, "utf8");
      fs.createReadStream(uploadedFile.filepath)
        .pipe(csv())
        .on("data", (data) => dataRows.push(data))
        .on("end", async () => {
          let tableName = "table_";
          {
            let letters = [
              "A",
              "b",
              "C",
              "D",
              "e",
              "F",
              "G",
              "h",
              "I",
              "J",
              "k",
              "L",
              "m",
              "N",
              "o",
              "P",
              "Q",
              "r",
              "s",
              "T",
              "u",
              "V",
              "W",
              "x",
              "Y",
              "Z",
            ];
            for (let i = 0; i < 14; i++) {
              let n = Math.floor(Math.random() * letters.length);
              tableName += letters[n];
            }
          }

          const createTableResult = await tableService.create({
            userId,
            projectId,
            name: tableName,
            columns: [
              new constants.Column({
                name: "id",
                type: constants.availableDataTypes.SERIAL,
                isPrimaryKey: true,
                isNullable: false,
              }),
              ...Object.keys(dataRows[0]).map((columnName) => {
                return new constants.Column({
                  name:
                    ["id", "updatedAt", "createdAt"].indexOf(columnName) >= 0
                      ? columnName.toUpperCase()
                      : columnName,
                  type: constants.availableDataTypes.TEXT,
                });
              }),
            ],
            recordsData: dataRows,
          });
          if (createTableResult?.error) {
            return res
              .status(createTableResult.errorCode)
              .json({ message: createTableResult.errorMessage });
          }

          return res.status(201).json({
            message: "Table created successfuly",
            tableId: createTableResult.id,
          });
        });
    });
  } catch (err) {
    console.error("Error while impoerTable", err);
    return res.status(500).json({ message: "server error" });
  }
};

module.exports = {
  createTable,
  getTable,
  getProjectTables,
  updateTable,
  deleteTable,
  importTable,
};
