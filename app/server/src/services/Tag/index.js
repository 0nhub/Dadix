const { Op } = require("sequelize");
const { sequelize } = require("../../config/database");
const Tag = require("../../models/TagColumnOptions");

const create = async ({
  value,
  color,
  userId,
  tableId,
  columnId,
  externalTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  try {
    const isValueExist =
      (
        await Tag.findAll({
          where: {
            tableId: tableId,
            columnId: columnId,
            value: value,
          },
          raw: true,
          transaction: transaction,
        })
      ).length > 0;
    if (isValueExist) {
      return {
        error: true,
        errorCode: 500,
        errorMessage: "Tag value already exist",
      };
    }
    const order = await Tag.count({
      where: {
        tableId: tableId,
        columnId: columnId,
      },
      transaction: transaction,
    });
    const createdTag = await Tag.create(
      {
        userId: userId,
        tableId: tableId,
        columnId: columnId,
        value: value,
        color: color || "#ffffff",
        order: order,
      },
      { transaction: transaction, raw: true }
    );

    if (!externalTransaction) {
      await transaction.commit();
    }

    return createdTag;
  } catch (err) {
    if (externalTransaction) {
      throw new Error(err);
    }
    console.error(err);
    await transaction.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: err.original
        ? ("" + err.original).split("\n")[0]
        : `Server error`,
    };
  }
};

const createMany = async ({
  userId,
  tableId,
  columnId,
  tags,
  externalTransaction = undefined,
}) => {
  const transaction = externalTransaction || (await sequelize.transaction());
  try {
    const currentTags = (
      await Tag.findAll({
        where: {
          tableId: tableId,
          columnId: columnId,
        },
        raw: true,
        transaction: transaction,
      })
    ).map((tag) => tag.value);
    tags = tags.filter((tag) => currentTags.indexOf(tag) < 0);

    if (tags.length === 0) {
      return {};
    }

    const offset = await Tag.count({
      where: {
        tableId: tableId,
        columnId: columnId,
      },
      transaction: transaction,
    });
    const createdTag = await Tag.bulkCreate(
      tags.map((tag, index) => ({
        userId: userId,
        tableId: tableId,
        columnId: columnId,
        value: tag.value,
        color: "#ffffff",
        order: offset + index,
      })),
      { transaction: transaction, raw: true }
    );

    if (!externalTransaction) {
      await transaction.commit();
    }

    return createdTag;
  } catch (err) {
    if (externalTransaction) {
      throw new Error(err);
    }
    console.error(err);
    await transaction.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: err.original
        ? ("" + err.original).split("\n")[0]
        : `Server error`,
    };
  }
};

const getAll = async ({
  userId,
  tableId,
  columnId,
  attributes = undefined,
  externalTransaction = undefined,
}) => {
  const tags = await Tag.findAll({
    where: {
      tableId: tableId,
      columnId: columnId,
    },
    attributes: attributes,
    raw: true,
    transaction: externalTransaction,
  });
  return (tags || [])
    .sort((tag1, tag2) => tag1.order - tag2.order)
    .map((tag, index) => ({ ...tag, order: index }));
};

const update = async ({
  userId,
  tableId,
  columnId,
  id,
  tagData,
  externalTransaction,
}) => {
  const allawedFieldsToUpdate = ["value", "order", "color"];
  const fieldsToUpdate = Object.keys(tagData);
  if (
    fieldsToUpdate.filter((field) => allawedFieldsToUpdate.indexOf(field) < 0)
      .length > 0
  ) {
    return {
      error: true,
      errorCode: 400,
      errorMessage: "Invalid request",
    };
  }

  const transaction = externalTransaction || (await sequelize.transaction());
  try {
    const currentTags = await Tag.findAll({
      where: {
        tableId: tableId,
        columnId: columnId,
      },
      raw: true,
      transaction: transaction,
    });
    const currentTagsValus = currentTags.map((tag) => tag.value);
    if (currentTagsValus.indexOf(tagData.value) >= 0) {
      return {
        error: true,
        errorCode: 400,
        errorMessage: "Tag value already exist",
      };
    }
    const tagsToUpdateOrder = [];
    // if order of a tag updated, it will affect other tags order
    if (fieldsToUpdate.indexOf("order") >= 0) {
      // add "epsilon" to the target tag new order value, to avoid having 2 tags with same order value
      // and the sign of "epsilon" (- or +) will ditermin the exact new position of the tag
      // here epsilon can be -0.1 or +0.1
      for (let i = 0; i < currentTags.length; i++) {
        if (`${currentTags[i].id}` !== `${id}`) {
          continue;
        }
        const oldOrder = currentTags[i].order;
        const epsilon = oldOrder < tagData.order ? 0.1 : -0.1;
        currentTags[i].order = tagData.order + epsilon;
      }
      currentTags
        .sort((tag1, tag2) => tag1.order - tag2.order)
        .map((tag, index) => {
          if (tag.order !== index && `${tag.id}` !== `${id}`) {
            const updatedTag = {};
            fieldsToUpdate.map((field) => {
              updatedTag[field] = tag[field];
              return null;
            });
            tagsToUpdateOrder.push({
              ...updatedTag,
              tableId: tableId,
              columnId: columnId,
              id: tag.id,
              order: index,
            });
          }
          return null;
        })
        .filter((elm) => elm !== null);
    }

    // Tag.bulkCreate will not create new tag if exist but it will update fields you sprecify in "updateOnDuplicate"
    const updatedTags = await Tag.bulkCreate(
      [
        {
          tableId: tableId,
          columnId: columnId,
          id: id,
          ...tagData,
        },
        ...tagsToUpdateOrder,
      ],
      {
        updateOnDuplicate: fieldsToUpdate,
        transaction: transaction,
        raw: true,
      }
    );
    if (!externalTransaction) {
      await transaction.commit();
    }

    return updatedTags[0];
  } catch (err) {
    if (externalTransaction) {
      throw new Error(err);
    }
    console.error(err);
    await transaction.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: err.original
        ? ("" + err.original).split("\n")[0]
        : `Server error`,
    };
  }
};

const remove = async ({ userId, tableId, columnId, id }) => {
  const transaction = await sequelize.transaction();

  try {
    await Tag.destroy({
      where: {
        tableId: tableId,
        columnId: columnId,
        id: id,
      },
      transaction: transaction,
    });

    // update remaining tags order
    const tagsToUpdateOrder = [];
    // get all tags
    const allTags = await Tag.findAll({
      where: {
        tableId: tableId,
        columnId: columnId,
      },
      raw: true,
      transaction: transaction,
    });
    // get new order for remaining tags
    allTags
      .filter((tag) => `${tag.id}` !== `${id}`)
      .sort((tag1, tag2) => tag1.order - tag2.order)
      .map((tag, index) => {
        if (tag.order !== index && `${tag.id}` !== `${id}`) {
          tagsToUpdateOrder.push({
            tableId: tableId,
            columnId: columnId,
            id: tag.id,
            order: index,
          });
        }
        return null;
      });
    if (tagsToUpdateOrder.length > 0) {
      await Tag.bulkCreate(tagsToUpdateOrder, {
        updateOnDuplicate: ["order"],
        transaction: transaction,
        raw: true,
      });
    }

    await transaction.commit();

    return { message: "Tag removed successfuly!" };
  } catch (err) {
    console.error(err);
    await transaction.rollback();
    return {
      error: true,
      errorCode: 500,
      errorMessage: err.original
        ? ("" + err.original).split("\n")[0]
        : `Server error`,
    };
  }
};

const deleteAllTableTags = async ({
  userId,
  tableId,
  externalTransaction = undefined,
}) => {
  try {
    await Tag.destroy({
      where: {
        tableId: tableId,
      },
      transaction: externalTransaction,
    });

    return { message: "Table columns removed successfuly!" };
  } catch (err) {
    console.error(err);
    if (externalTransaction) {
      throw new Error("Error remove table tags");
    }
    return {
      error: true,
      errorCode: 500,
      errorMessage: err.original
        ? ("" + err.original).split("\n")[0]
        : `Server error`,
    };
  }
};

const deleteAllTablesTags = async ({
  userId,
  tablesIds,
  externalTransaction = undefined,
}) => {
  try {
    await Tag.destroy({
      where: {
        tableId: {
          [Op.in]: tablesIds,
        },
      },
      transaction: externalTransaction,
    });

    return { message: "Tables columns tags removed successfuly!" };
  } catch (err) {
    console.error(err);
    if (externalTransaction) {
      throw new Error("Error remove tables tags");
    }
    return {
      error: true,
      errorCode: 500,
      errorMessage: err.original
        ? ("" + err.original).split("\n")[0]
        : `Server error`,
    };
  }
};

module.exports = {
  create,
  createMany,
  getAll,
  deleteAllTableTags,
  deleteAllTablesTags,
  update,
  remove,
};
