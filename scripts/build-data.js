// build-data.js
// PokéAPI에서 1~151번 포켓몬 정보를 받아와 data/pokemon.json 파일로 저장하는 스크립트.
// 내 컴퓨터에서 딱 한 번(또는 데이터가 필요할 때) 직접 실행한다: npm run build-data
// 1단계에서는 벡터(imageVector, textVector)와 labels는 아직 비워두고,
// 이름·타입·색·그림 주소 같은 "글자 정보"만 채운다.

import { writeFile, mkdir } from "node:fs/promises";

const POKEMON_COUNT = 151; // 1세대 포켓몬 수

// 포켓몬 한 마리의 정보를 PokéAPI 두 곳에서 가져와 합치는 함수
async function fetchPokemon(id) {
  // /pokemon/{id} : 영어 이름, 타입, 공식 그림 주소
  const pokemonRes = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
  const pokemonData = await pokemonRes.json();

  // /pokemon-species/{id} : 한국어 이름, 색상
  const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
  const speciesData = await speciesRes.json();

  // names 배열에서 language가 ko(한국어)인 항목을 찾는다
  const koName = speciesData.names.find((n) => n.language.name === "ko");

  return {
    id,
    nameEn: pokemonData.name,
    nameKo: koName ? koName.name : pokemonData.name,
    types: pokemonData.types.map((t) => t.type.name),
    color: speciesData.color.name,
    vibe: null, // 분위기는 2단계에서 CLIP으로 계산해 채운다
    artwork: pokemonData.sprites.other["official-artwork"].front_default,
    imageVector: [], // 2단계에서 채운다
    textVector: [], // 2단계에서 채운다
  };
}

// 전체 실행 함수
async function main() {
  console.log(`PokéAPI에서 ${POKEMON_COUNT}마리 정보를 순서대로 받아옵니다...`);

  const pokemonList = [];

  // 한꺼번에 요청하지 않고 for문으로 하나씩 순서대로 요청한다
  // (PokéAPI에 부담을 덜 주기 위함)
  for (let id = 1; id <= POKEMON_COUNT; id++) {
    const pokemon = await fetchPokemon(id);
    pokemonList.push(pokemon);
    console.log(`  ${id}/${POKEMON_COUNT} ${pokemon.nameKo} (${pokemon.nameEn}) 완료`);
  }

  // 최종 데이터 형태 (PRD 6-1 형식)
  const result = {
    model: "Xenova/clip-vit-base-patch32", // 2단계에서 실제로 사용할 CLIP 모델 이름
    labels: {
      subject: [], // 2단계에서 채운다 (사람/동물/풍경/사물 판정용)
      vibe: [], // 2단계에서 채운다 (분위기 판정용)
    },
    pokemon: pokemonList,
  };

  // data 폴더가 없으면 만들고, pokemon.json 파일로 저장
  await mkdir("data", { recursive: true });
  await writeFile("data/pokemon.json", JSON.stringify(result, null, 2), "utf-8");

  console.log(`완료! data/pokemon.json 에 ${pokemonList.length}마리 저장됨`);
}

main();
