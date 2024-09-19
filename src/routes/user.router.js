import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { gameDataClient, userDataClient } from "../utils/prisma/index.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import dotenv from "dotenv";

dotenv.config();
const secretKey = process.env.secretKey;
const router = express.Router();

//사용자 회원가입 API
router.post("/sign-up", async (req, res, next) => {
  try {
    const { account, password, passwordConfirm, name } = req.body;

    const isExistUser = await userDataClient.account.findFirst({
      where: {
        account,
      },
    });

    if (isExistUser) {
      return res.status(400).json({ message: "이미 존재하는 아이디입니다." });
    }

    if (password !== passwordConfirm) {
      return res.status(400).json({ message: "비밀번호를 확인해주세요." });
    }
    const accountRegex = /^[a-z0-9]+$/;

    if (!accountRegex.test(account)) {
      return res.status(400).json({
        message: "아이디는 영어 소문자와 숫자의 조합으로 만들어야 합니다.",
      });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "비밀번호는 최소 6자 이상이어야 합니다." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Users 테이블에 사용자를 추가합니다.
    const user = await userDataClient.account.create({
      data: { account, password: hashedPassword, name },
    });

    return res.status(201).json({
      userId: user.id,
      account: user.account,
      name: user.name,
      message: "회원가입이 완료되었습니다.",
    });
  } catch (err) {
    console.error("회원가입 중 오류 발생: ", err);
    return res
      .status(500)
      .json({ message: "회원가입 중 오류가 발생하였습니다." });
  }
});

// 로그인 API
router.post("/sign-in", async (req, res, next) => {
  try {
    const { account, password } = req.body;
    const user = await userDataClient.account.findFirst({ where: { account } });

    if (!user)
      return res.status(400).json({ message: "존재하지 않는 아이디입니다." });
    // 입력받은 사용자의 비밀번호와 데이터베이스에 저장된 비밀번호를 비교합니다.
    else if (!(await bcrypt.compare(password, user.password)))
      return res.status(400).json({ message: "비밀번호가 일치하지 않습니다." });

    // 로그인에 성공하면, 사용자의 userId를 바탕으로 토큰을 생성합니다.
    const token = jwt.sign(
      {
        userId: user.userId,
      },
      secretKey,
    );

    // authotization 쿠키에 Berer 토큰 형식으로 JWT를 저장합니다.
    res.cookie("authorization", `Bearer ${token}`);
    return res.status(200).json({ message: "로그인 성공" });
  } catch (error) {
    console.error("로그인 중 오류 발생:", error);
    return res
      .status(500)
      .json({ message: "로그인 중 오류가 발생하였습니다." });
  }
});

//캐릭터 생성 API
router.post("/character", authMiddleware, async (req, res) => {
  const { name } = req.body;
  const accountId = req.user.id;

  try {
    const isExistCharacterName = await userDataClient.character.findUnique({
      where: { name },
    });

    if (isExistCharacterName) {
      return res.status(400).json({ message: "이미 존재하는 캐릭터명입니다." });
    }

    const newCharacter = await userDataClient.character.create({
      data: {
        name,
        accountId,
        health: 500,
        power: 100,
        money: 10000,
        characterInventory: {
          create: [],
        },
        characterItem: {
          create: [],
        },
        include: {
          characterInventory: true,
          characterItem: true,
        },
      },
    });

    return res.status(201).json(newCharacter);
  } catch (err) {
    console.error("캐릭터 생성 중 에러 발생:", err);
    return res.status(500).json({
      message: "캐릭터 생성 중 오류가 발생하였습니다.",
    });
  }
});

//캐릭터 삭제 API
router.delete("/character/:id", authMiddleware, async (req, res) => {
  const characterId = parseInt(req.params.id, 10);
  const accountId = req.user.id;

  try {
    const character = await userDataClient.character.findUnique({
      where: { id: characterId },
      include: { account: true },
    });

    if (!character) {
      return res.status(404).json({
        message: "삭제하려는 캐릭터를 찾을 수 없습니다.",
      });
    }
    if (character.accountId !== accountId) {
      return res
        .status(403)
        .json({ message: "해당 캐릭터를 삭제할 권한이 없습니다." });
    }

    await userDataClient.character.delete({
      where: { id: characterId },
    });

    return res
      .status(200)
      .json({ message: "캐릭터가 정상적으로 삭제 되었습니다." });
  } catch (err) {
    console.error("캐릭터 삭제 중 오류 발생: ", err);
    return res.status(500).json({
      message: "캐릭터 삭제 중 오류가 발생하였습니다.",
    });
  }
});

//캐릭터 상세조회 API
router.get("/character/:id", authMiddleware, async (req, res) => {
  const characterId = parseInt(req.params.id, 10);
  const accountId = req.user.id;

  try {
    const character = await userDataClient.character.findUnique({
      where: { id: characterId },
      include: {
        account: true,
        characterInventory: true,
        characterItem: true,
      },
    });

    if (!character) {
      return res.status(404).json({ message: "캐릭터를 찾을 수 없습니다." });
    }

    const isOwner = character.accountId === accountId;

    const characterData = {
      name: character.name,
      health: character.health,
      power: character.power,
    };
    if (isOwner) {
      characterData.money = character.money;
    }

    return res.status(200).json(characterData);
  } catch (err) {
    console.error("캐릭터 상세 조회 중 에러 발생:", err);
    return res.status(500).json({
      message: "캐릭터 상세 조회 중 에러가 발생하였습니다.",
    });
  }
});

//아이템 구매 API
router.post(
  "character/:characterId/purchase",
  authMiddleware,
  async (req, res) => {
    const characterId = parseInt(req.params.characterId, 10);
    const userId = req.user.id;
    const itemsToPurchase = req.body;

    try {
      const character = await userDataClient.character.findFirst({
        where: {
          id: characterId,
          accountId: userId,
        },
      });

      if (!character) {
        return res.status(403).json({ message: "내 캐릭터가 아닙니다." });
      }

      let totalCost = 0;
      for (const item of itemsToPurchase) {
        const { item_code, count } = item;
        const itemInfo = await gameDataClient.item.findUnique({
          where: { item_code },
          select: { item_price: true },
        });

        if (!itemInfo) {
          return res
            .status(404)
            .json({ message: `아이템 코드 ${item_code}를 찾을 수 없습니다.` });
        }

        totalCost += itemInfo.item_price * count;
      }

      if (character.money < totalCost) {
        return res.status(400).json({ message: "게임 머니가 부족합니다." });
      }

      await userDataClient.$transaction(async (userDataClient) => {
        for (const item of itemsToPurchase) {
          const { item_code, count } = item;

          await userDataClient.characterInventory.createMany({
            data: Array(count).fill({
              characterId,
              itemId: item_code,
            }),
          });
        }

        await userDataClient.character.update({
          where: { id: characterId },
          data: { money: { decrement: totalCost } },
        });
      });

      const updateCharacter = await userDataClient.character.findUnique({
        where: { id: characterId },
        select: { money: true },
      });

      return res.status(200).json({
        message: "아이템을 구매하였습니다.",
        money: updateCharacter.money,
      });
    } catch (err) {
      console.error("아이템 구매 중 에러 발생:", err);
      return res.status(500).json({
        message: "아이템 구매 중 에러가 발생하였습니다.",
      });
    }
  },
);

//아이템 판매 API
router.post("character/:characterId/sell", authMiddleware, async (req, res) => {
  const characterId = parseInt(req.params.characterId, 10);
  const userId = req.user.id;
  const itemsToSell = req.body;

  try {
    const character = await userDataClient.character.findFirst({
      where: {
        id: characterId,
        accountId: userId,
      },
    });

    if (!character) {
      return res.status(403).json({ message: "내 캐릭터가 아닙니다." });
    }

    for (const item of itemsToSell) {
      const { item_code } = item;
      const inventoryItem = await userDataClient.characterInventory.findFirst({
        where: {
          characterId,
          itemId: item_code,
        },
      });

      if (!inventoryItem) {
        return res
          .status(400)
          .json({ message: "인벤토리에 해당 아이템이 없습니다." });
      }

      const equippedItem = await userDataClient.characterItem.findFirst({
        where: {
          characterId,
          itemId: item_code,
        },
      });

      if (equippedItem) {
        return res
          .status(400)
          .json({ message: "장착 중인 아이템은 판매할 수 없습니다." });
      }

      const itemInfo = await gameDataClient.item.findUnique({
        where: { item_code },
        select: { item_price: true },
      });

      if (!itemInfo) {
        return res.status(404).json({
          message: `아이템 코드 ${item_code}를 찾을 수 없습니다.`,
        });
      }

      const salePrice = Math.floor(itemInfo.item_price * 0.6);

      await userDataClient.character.update({
        where: { id: characterId },
        data: { money: { increment: salePrice } },
      });

      await userDataClient.characterInventory.delete({
        where: {
          id: inventoryItem.id,
        },
      });
    }

    const updatedCharacter = await userDataClient.character.findFirst({
      where: { id: characterId },
      select: { money: true },
    });

    return res.status(200).json({
      message: "아이템을 판매하였습니다.",
      money: updatedCharacter.money,
    });
  } catch (err) {
    console.error("아이템 판매 중 에러 발생:", err);
    return res.status(500).json({
      message: "아이템 판매 중 에러가 발생하였습니다.",
    });
  }
});

//인벤토리 아이템 조회 API
router.get(
  "character/:characterId/inventory",
  authMiddleware,
  async (req, res) => {
    const characterId = parseInt(req.params.characterId, 10);
    const userId = req.user.id;
    try {
      const character = await userDataClient.character.findFirst({
        where: {
          id: characterId,
          accountId: userId,
        },
      });

      if (!character) {
        return res.status(403).json({ message: "내 캐릭터가 아닙니다." });
      }

      const inventoryItems = await userDataClient.characterInventory.findMany({
        where: {
          characterId,
        },
      });

      const itemCountMap = {};

      for (const inventoryItem of inventoryItems) {
        const { itemId } = inventoryItem;

        const itemInfo = await gameDataClient.item.findUnique({
          where: { item_code: itemId },
          select: { item_code: true, item_name: true },
        });

        if (itemInfo) {
          const { item_code, item_name } = itemInfo;

          if (!itemCountMap[item_code]) {
            itemCountMap[item_code] = {
              item_code,
              item_name,
              count: 0,
            };
          }
          itemCountMap[item_code].count += 1;
        }
      }
      const response = Object.values(itemCountMap);

      return res.status(200).json(response);
    } catch (err) {
      console.error("아이템 조회 중 에러 발생:", err);
      return res.status(500).json({
        message: "아이템 조회 중 에러가 발생하였습니다.",
      });
    }
  },
);

//장착 아이템 목록 조회 API
router.get("character/:characterId/equipped", async (req, res) => {
  const characterId = parseInt(req.params.characterId, 10);

  try {
    const equippedItems = await userDataClient.characterItem.findMany({
      where: { characterId },
      select: { itemId: true },
    });

    const response = [];
    for (const equippedItem of equippedItems) {
      const itemInfo = await gameDataClient.item.findUnique({
        where: { item_code: equippedItem.itemId },
        select: { item_code: true, item_name: true },
      });

      if (itemInfo) {
        response.push(itemInfo);
      }
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error("장착 아이템 조회 중 에러 발생:", err);
    return res
      .status(500)
      .json({ message: "장착 아이템 조회 중 에러가 발생하였습니다." });
  }
});

//아이템 장착 API
router.post(
  "character/:characterId/equip",
  authMiddleware,
  async (req, res) => {
    const characterId = parseInt(req.params.characterId, 10);
    const userId = req.user.id;
    const { item_code } = req.body;

    try {
      const character = await userDataClient.character.findFirst({
        where: {
          id: characterId,
          accountId: userId,
        },
      });

      if (!character) {
        return res.status(403).json({ message: "내 캐릭터가 아닙니다." });
      }

      const inventoryItem = await userDataClient.characterInventory.findFirst({
        where: {
          characterId,
          itemId: item_code,
        },
      });

      if (!inventoryItem) {
        return res
          .status(400)
          .json({ message: "인벤토리에 해당 아이템이 없습니다." });
      }

      const equippedItem = await userDataClient.characterItem.findFirst({
        where: {
          characterId,
          itemId: item_code,
        },
      });

      if (equippedItem) {
        return res.status(400).json({ message: "이미 장착된 아이템입니다." });
      }

      const itemInfo = await gameDataClient.item.findUnique({
        where: { item_code },
      });

      if (!itemInfo) {
        return res
          .status(404)
          .json({ message: "아이템 정보를 찾을 수 없습니다." });
      }

      await userDataClient.character.update({
        where: { id: characterId },
        data: {
          health: { increment: itemInfo.health },
          power: { increment: itemInfo.power },
        },
      });

      await userDataClient.characterItem.create({
        data: {
          characterId,
          itemId: item_code,
        },
      });

      await userDataClient.characterInventory.delete({
        where: {
          id: inventoryItem.id,
        },
      });
      return res.status(200).json({ message: "아이템을 장착했습니다." });
    } catch (err) {
      console.error("아이템 장착 중 에러 발생:", err);
      return res
        .status(500)
        .json({ message: "아이템 장착 중 에러가 발생하였습니다." });
    }
  },
);


//아이템 탈착 API
router.post(
  "character/:characterId/unequip",
  authMiddleware,
  async (req, res) => {
    const characterId = parseInt(req.params.characterId, 10);
    const userId = req.user.id;
    const { item_code } = req.body;

    try {
      const character = await userDataClient.character.findFirst({
        where: {
          id: characterId,
          accountId: userId,
        },
      });

      if (!character) {
        return res.status(403).json({ message: "내 캐릭터가 아닙니다." });
      }

      const equippedItem = await userDataClient.characterItem.findFirst({
        where: {
          characterId,
          itemId: item_code,
        },
      });

      if (!equippedItem) {
        return res.status(400).json({ message: "장착되어있지 않은 아이템입니다." });
      }

      const itemInfo = await gameDataClient.item.findUnique({
        where: { item_code },
      });

      if (!itemInfo) {
        return res
          .status(404)
          .json({ message: "아이템 정보를 찾을 수 없습니다." });
      }

      await userDataClient.character.update({
        where: { id: characterId },
        data: {
          health: { decrement: itemInfo.health },
          power: { decrement: itemInfo.power },
        },
      });

      await userDataClient.characterItem.delete({
        where: {
          id: equippedItem.id
        },
      });

      await userDataClient.characterInventory.create({
        data: {
          characterId,
          itemId: item_code
        },
      });

      return res.status(200).json({ message: "아이템을 탈착했습니다." });

    } catch (err) {
      console.error("아이템 틸착 중 에러 발생:", err);
      return res
        .status(500)
        .json({ message: "아이템 탈착 중 에러가 발생하였습니다." });
    }
  },
);


//아이템 탈착 API
router.post(
  "character/:characterId/unequip",
  authMiddleware,
  async (req, res) => {
    const characterId = parseInt(req.params.characterId, 10);
    const userId = req.user.id;
    const { item_code } = req.body;

    try {
      const character = await userDataClient.character.findFirst({
        where: {
          id: characterId,
          accountId: userId,
        },
      });

      if (!character) {
        return res.status(400).json({ message: "내 캐릭터가 아닙니다." });
      }

      const equippedItem = await userDataClient.characterItem.findFirst({
        where: {
          characterId,
          itemId: item_code,
        },
      });

      if (!equippedItem) {
        return res.status(400).json({ message: "장착되어있지 않은 아이템입니다." });
      }

      const itemInfo = await gameDataClient.item.findUnique({
        where: { item_code },
      });

      if (!itemInfo) {
        return res
          .status(404)
          .json({ message: "아이템 정보를 찾을 수 없습니다." });
      }

      await userDataClient.character.update({
        where: { id: characterId },
        data: {
          health: { decrement: itemInfo.health },
          power: { decrement: itemInfo.power },
        },
      });

      await userDataClient.characterItem.delete({
        where: {
          id: equippedItem.id
        },
      });

      await userDataClient.characterInventory.create({
        data: {
          characterId,
          itemId: item_code
        },
      });

      return res.status(200).json({ message: "아이템을 탈착했습니다." });

    } catch (err) {
      console.error("아이템 틸착 중 에러 발생:", err);
      return res
        .status(500)
        .json({ message: "아이템 탈착 중 에러가 발생하였습니다." });
    }
  },
);


//게임머니 증가 API
router.post(
  "character/:characterId/earn-money",
  authMiddleware,
  async (req, res) => {
    const characterId = parseInt(req.params.characterId, 10);
    const userId = req.user.id;

    try {
      const character = await userDataClient.character.findFirst({
        where: {
          id: characterId,
          accountId: userId,
        },
      });

      if (!character) {
        return res.status(400).json({ message: "내 캐릭터가 아닙니다." });
      }

      await userDataClient.character.update({
        where: {id: characterId},
        data: {money: {increment: 100}}
      })


      const updateCharacter = await userDataClient.character.findUnique({
        where: {id: characterId},
        select: {money: true}
      })

      return res.status(200).json({
        message:"게임 머니가 증가하였습니다.",
        money: updateCharacter.money
      })

    } catch (err) {
      console.error("게임머니 증가 중 에러 발생:", err);
      return res
        .status(500)
        .json({ message: "게임 머니 증가 중 에러가 발생하였습니다." });
    }
  },
);

export default router;
