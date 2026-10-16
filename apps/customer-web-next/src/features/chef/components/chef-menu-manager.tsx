"use client";
import { sessionFetch } from "@/features/auth/api/sessionFetch";

import { ChefError, chefApiError, chefErrorText, isChefAccessText } from "@/features/chef/lib/chef-errors";
import { ChefAccessRetry } from "@/features/chef/components/chef-account-menu";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  ChevronRight,
  CopyPlus,
  Ellipsis,
  Gauge,
  Minus,
  Plus,
  Store,
  ToggleRight,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import {
  ChefChoiceChips,
  ChefEmpty,
  ChefFlash,
  ChefPageHead,
  ChefPill,
  ChefSection,
} from "@/features/chef/components/chef-ui";
import { ChefMenuSkeleton } from "@/features/chef/components/chef-loading";
import { ChefCategoryPicker } from "@/features/chef/components/chef-category-picker";
import { ChefMenuViews } from "@/features/chef/components/chef-menu-views";
import { AppleSwitch } from "@/shared/ui/AppleSwitch";
import { Dialog, secondaryActionClass, Sheet, useOverlayHistory } from "@/shared/ui/overlays/overlay";
import { isFeatureUnavailable } from "@/shared/lib/feature-availability";
import { parseChefKitchen } from "@/features/chef/lib/chef-kitchen-contract";
import { chefMenuFailure } from "@/features/chef/lib/chef-menu-errors";
import { categoryLabel, DISH_CATEGORIES, knownCategory } from "@/features/chef/lib/dish-categories";
import {
  parseChefMenuItem,
  parseChefMenuItems,
  type ChefMenuItem,
  type ChefMenuItemInput,
  type FoodType,
  type MenuItemStatus,
  type SpiceLevel,
} from "@/features/chef/lib/chef-menu-contract";
import { shrinkPhoto } from "@/features/chef/lib/shrink-photo";
import { SPICE_LEVEL_LABELS } from "@/shared/lib/spice-level";
import { format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";

const TEXT = messages({
  en: {
    menu: "Menu", VEG: "Veg", NON_VEG: "Non-veg", EGG: "Egg",
    // The words customers see and filter by.
    MILD: SPICE_LEVEL_LABELS.MILD, MEDIUM: SPICE_LEVEL_LABELS.MEDIUM, SPICY: SPICE_LEVEL_LABELS.SPICY, spiceNotSet: "Not set",
    draft: "Draft · not on your menu", notOnMenu: "Not on your menu", onSale: "On sale", hidden: "Hidden from customers",
    kitchenCheckFailed: "Your kitchen could not be checked. Please retry.", kitchenInvalid: "Your kitchen could not be verified. Please retry.",
    menuLoadFailed: "Your menu could not be loaded. Please retry.", menuIncomplete: "The menu response was incomplete. Please retry.",
    menuUnreachable: "Could not connect to your menu. Please retry.",
    nameRequired: "Give your dish a name.", categoryRequired: "Choose a category, or type your own.", foodTypeRequired: "Choose Veg, Non-veg or Egg.",
    priceInvalid: "Enter a price greater than zero, with up to two decimal places.",
    wholeNumber: "{label} must be a whole number from 1 to 100,000.", weightRequired: "Enter the packed weight in grams.",
    saveUnconfirmed: "The service did not confirm the save. Reload your menu before trying again.",
    saveIncomplete: "The service returned an incomplete save response. Reload your menu to check the result.",
    photoUploadFailed: "The photo could not be uploaded. Please retry.",
    photoUploadUnconfirmed: "The photo upload was not confirmed. Please reload your menu to check it.",
    dishAdded: "Dish added", changesSaved: "Changes saved",
    connectionLost: "Connection interrupted. Please reload your menu to check the result.",
    photoNotSaved: "Dish details saved, but a photo was not confirmed. Photos still listed as New were not uploaded. {detail}",
    availabilityUnconfirmed: "Availability was not confirmed. Reload the menu to check it.",
    availabilityIncomplete: "Availability returned an incomplete response. Reload the menu to check it.",
    availabilityFailed: "Availability could not be confirmed. Reload the menu to check it.",
    turnedOn: "Dish turned on", turnedOff: "Dish turned off",
    deleteRefused: "We couldn’t delete {name}. If it’s in a meal plan, change the plan first.",
    deleteSoon: "Deleting dishes is coming soon.", deleted: "{name} deleted",
    photoChangeUnconfirmed: "The photo change was not confirmed. Reload the menu to check it.",
    photoChangeIncomplete: "The photo change returned an incomplete response. Reload the menu to check it.",
    photoChangeFailed: "The photo change could not be confirmed. Reload the menu to check it.",
    photoRemoved: "Photo removed", coverChanged: "Cover photo changed",
    setUpFirst: "Set up your kitchen first", setUpText: "Save your kitchen name and pickup address, then add your dishes.",
    setUpKitchen: "Set up my kitchen", checkAgain: "Check again",
    loadingDishes: "Loading your dishes…", countOne: "{count} dish · {onSale} on sale now", countMany: "{count} dishes · {onSale} on sale now",
    intro: "Dishes customers can order from your kitchen.", addDish: "Add dish",
    loadFailed: "Your menu couldn’t load", reloadMenu: "Reload menu", loadingMenu: "Loading menu",
    emptyImage: "A home chef tipping chopped vegetables from a board into a pot on the stove",
    firstDish: "Add your first dish", firstDishText: "Start with something you cook often. A photo, a price and the packed weight are all customers need.",
    noDishOnTitle: "No dish is on today", noDishOnText: "Customers can’t order. Turn on the dishes you are cooking today.",
    limits: "Daily limits", limitsMeta: "How many plates you can cook each day",
    showDishes: "Show dishes", all: "All", filterOn: "On sale", notOnSale: "Not on sale",
    groupOne: "{category}, {count} dish", groupMany: "{category}, {count} dishes",
    editName: "Edit {name}", servesCount: "Serves {count}", available: "{name} available to order",
    draftNote: "To put a draft dish on your menu, open it and turn on “Customers can order it”.",
    editDish: "Edit dish", addADish: "Add a dish", options: "Dish options",
    editIntro: "Customers see your changes as soon as you save.", newIntro: "Fill in the basics. You can change any of this later.",
    photos: "Photos", photosNote: "The first photo is the one customers see. Up to 5.", gallery: "Photo gallery",
    dishPhotos: "Dish photos: ", addPhoto: "Add photo",
    photoType: "Choose a JPEG, PNG or WebP photo up to 8 MB.", photoLimit: "You can add up to {count} photos per dish.",
    savedPhoto: "Saved photo {number}", cover: "Cover", makeCover: "Make cover", makeCoverLabel: "Make saved photo {number} the cover",
    removeSaved: "Remove saved photo {number}", preview: "Dish preview", newPhoto: "New photo {name}",
    coverNew: "Cover · New", new: "New", remove: "Remove {name}",
    photoCount: "{count} of {max} photos", photoNow: "Removing a saved photo or changing the cover happens right away.",
    about: "About the dish", dishName: "Dish name", namePlaceholder: "For example, Chicken dum biryani",
    foodType: "Food type", description: "Description", optional: "(optional)",
    descriptionPlaceholder: "What makes it special: the masala, the rice, how you cook it",
    priceAndPortion: "Price and portion", price: "Price", pricePlaceholder: "e.g. 180",
    serves: "Serves", servesHint: "(people, optional)", fewer: "One person fewer", more: "One person more", servesNotSet: "Not set",
    readyIn: "Ready in", readyHint: "(minutes, optional)", readyPlaceholder: "e.g. 30", cookingTimes: "Usual cooking times",
    hour: "1 hour", minutes: "{minutes} min", spiceLevel: "Spice level",
    packing: "Packing for delivery", packedWeight: "Packed weight", weightLabel: "Packed weight (grams)",
    weightHelp: "One packed portion, with its box. The delivery partner needs this.", weightPlaceholder: "e.g. 500",
    weights: "Usual packed weights", grams: "{value} g", kilograms: "{value} kg",
    thermal: "Needs a thermal box", thermalHelp: "Turn on if this dish must stay hot or cold on the way.",
    canOrder: "Customers can order it", onWhenSaved: "This dish goes on your menu when you save.",
    draftUntil: "Saved as a draft until you are ready to sell it.", hiddenUntil: "Hidden from customers until you turn this on.",
    reloadCheck: "Reload menu to check the save", customersSee: "How customers see it", namePreview: "Your dish name",
    cancel: "Cancel", saving: "Saving…", saveDish: "Save dish",
    deleteTitle: "Delete {name}?", thisDish: "this dish",
    deleteText: "Customers won’t see it any more. If it’s in a meal plan, change the plan first.",
    deleting: "Deleting…", deleteDish: "Delete dish", duplicate: "Duplicate dish", duplicateText: "A new draft with the same details",
    discardChanges: "Discard your changes?", discardDish: "Discard this dish?", discardText: "What you added here will be lost.",
    discard: "Discard", keepEditing: "Keep editing",
  },
  te: {
    menu: "మెనూ", VEG: "వెజ్", NON_VEG: "నాన్-వెజ్", EGG: "ఎగ్",
    MILD: "తక్కువ కారం", MEDIUM: "మధ్యస్థ కారం", SPICY: "ఎక్కువ కారం", spiceNotSet: "ఎంచుకోలేదు",
    draft: "డ్రాఫ్ట్ · మీ మెనూలో లేదు", notOnMenu: "మీ మెనూలో లేదు", onSale: "అమ్మకానికి ఉంది", hidden: "కస్టమర్లకు కనిపించదు",
    kitchenCheckFailed: "మీ వంటగదిని చూడలేకపోయాం. మళ్లీ ప్రయత్నించండి.", kitchenInvalid: "మీ వంటగది వివరాలు సరిచూడలేకపోయాం. మళ్లీ ప్రయత్నించండి.",
    menuLoadFailed: "మీ మెనూ లోడ్ కాలేదు. మళ్లీ ప్రయత్నించండి.", menuIncomplete: "మెనూ వివరాలు పూర్తిగా రాలేదు. మళ్లీ ప్రయత్నించండి.",
    menuUnreachable: "మీ మెనూకు కనెక్ట్ కాలేకపోయాం. మళ్లీ ప్రయత్నించండి.",
    nameRequired: "మీ వంటకానికి పేరు పెట్టండి.", categoryRequired: "ఒక రకం ఎంచుకోండి, లేదా మీరే టైప్ చేయండి.", foodTypeRequired: "వెజ్, నాన్-వెజ్ లేదా ఎగ్ ఎంచుకోండి.",
    priceInvalid: "సున్నా కంటే ఎక్కువ ధర ఇవ్వండి. పాయింట్ తర్వాత 2 అంకెల వరకు మాత్రమే.",
    wholeNumber: "{label}: 1 నుండి 100,000 వరకు పూర్తి సంఖ్య ఇవ్వండి.", weightRequired: "ప్యాక్ చేసిన బరువును గ్రాముల్లో ఇవ్వండి.",
    saveUnconfirmed: "సేవ్ అయిందో లేదో తెలియలేదు. మళ్లీ ప్రయత్నించే ముందు మీ మెనూ మళ్లీ లోడ్ చేయండి.",
    saveIncomplete: "సేవ్ వివరాలు పూర్తిగా రాలేదు. ఏమైందో చూడటానికి మెనూ మళ్లీ లోడ్ చేయండి.",
    photoUploadFailed: "ఫోటో అప్‌లోడ్ కాలేదు. మళ్లీ ప్రయత్నించండి.",
    photoUploadUnconfirmed: "ఫోటో అప్‌లోడ్ అయిందో లేదో తెలియలేదు. చూడటానికి మెనూ మళ్లీ లోడ్ చేయండి.",
    dishAdded: "వంటకం జోడించాం", changesSaved: "మార్పులు సేవ్ అయ్యాయి",
    connectionLost: "కనెక్షన్ తెగిపోయింది. ఏమైందో చూడటానికి మెనూ మళ్లీ లోడ్ చేయండి.",
    photoNotSaved: "వంటకం వివరాలు సేవ్ అయ్యాయి, కానీ ఒక ఫోటో అప్‌లోడ్ అయిందో తెలియలేదు. ఇంకా “కొత్తది” అని ఉన్న ఫోటోలు అప్‌లోడ్ కాలేదు. {detail}",
    availabilityUnconfirmed: "వంటకం ఆన్/ఆఫ్ అయిందో తెలియలేదు. చూడటానికి మెనూ మళ్లీ లోడ్ చేయండి.",
    availabilityIncomplete: "వంటకం ఆన్/ఆఫ్ వివరాలు పూర్తిగా రాలేదు. చూడటానికి మెనూ మళ్లీ లోడ్ చేయండి.",
    availabilityFailed: "వంటకం ఆన్/ఆఫ్ మార్పు తెలియలేదు. చూడటానికి మెనూ మళ్లీ లోడ్ చేయండి.",
    turnedOn: "వంటకం ఆన్ చేశాం", turnedOff: "వంటకం ఆఫ్ చేశాం",
    deleteRefused: "{name} తొలగించలేకపోయాం. అది మీల్ ప్లాన్‌లో ఉంటే, ముందు ప్లాన్ మార్చండి.",
    deleteSoon: "వంటకాలు తొలగించడం త్వరలో వస్తుంది.", deleted: "{name} తొలగించాం",
    photoChangeUnconfirmed: "ఫోటో మార్పు అయిందో లేదో తెలియలేదు. చూడటానికి మెనూ మళ్లీ లోడ్ చేయండి.",
    photoChangeIncomplete: "ఫోటో మార్పు వివరాలు పూర్తిగా రాలేదు. చూడటానికి మెనూ మళ్లీ లోడ్ చేయండి.",
    photoChangeFailed: "ఫోటో మార్పు తెలియలేదు. చూడటానికి మెనూ మళ్లీ లోడ్ చేయండి.",
    photoRemoved: "ఫోటో తీసేశాం", coverChanged: "ముఖ్య ఫోటో మార్చాం",
    setUpFirst: "ముందు మీ వంటగదిని సిద్ధం చేయండి", setUpText: "మీ వంటగది పేరు, పికప్ చిరునామా సేవ్ చేసి, తర్వాత మీ వంటకాలు జోడించండి.",
    setUpKitchen: "వంటగది సిద్ధం చేయండి", checkAgain: "మళ్లీ చూడండి",
    loadingDishes: "మీ వంటకాలు లోడ్ అవుతున్నాయి…", countOne: "{count} వంటకం · ఇప్పుడు అమ్మకంలో {onSale}", countMany: "{count} వంటకాలు · ఇప్పుడు అమ్మకంలో {onSale}",
    intro: "మీ వంటగది నుండి కస్టమర్లు ఆర్డర్ చేయగల వంటకాలు.", addDish: "వంటకం జోడించండి",
    loadFailed: "మీ మెనూ లోడ్ కాలేదు", reloadMenu: "మెనూ మళ్లీ లోడ్ చేయండి", loadingMenu: "మెనూ లోడ్ అవుతోంది",
    emptyImage: "ఒక ఇంటి చెఫ్ తరిగిన కూరగాయలను బోర్డు నుండి స్టవ్ మీది గిన్నెలో వేస్తున్నారు",
    firstDish: "మీ మొదటి వంటకం జోడించండి", firstDishText: "మీరు తరచుగా వండేదానితో మొదలుపెట్టండి. ఫోటో, ధర, ప్యాక్ బరువు — కస్టమర్లకు ఇవి చాలు.",
    noDishOnTitle: "ఈరోజు ఏ వంటకం ఆన్‌లో లేదు", noDishOnText: "కస్టమర్లు ఆర్డర్ చేయలేరు. ఈరోజు వండే వంటకాలను ఆన్ చేయండి.",
    limits: "రోజువారీ పరిమితి", limitsMeta: "రోజుకు మీరు ఎన్ని ప్లేట్లు వండగలరు",
    showDishes: "చూపించాల్సిన వంటకాలు", all: "అన్నీ", filterOn: "అమ్మకానికి ఉన్నవి", notOnSale: "అమ్మకానికి లేనివి",
    groupOne: "{category}, {count} వంటకం", groupMany: "{category}, {count} వంటకాలు",
    editName: "{name} మార్చండి", servesCount: "{count} మందికి", available: "{name} — కస్టమర్లు ఆర్డర్ చేయవచ్చు",
    draftNote: "డ్రాఫ్ట్ వంటకాన్ని మెనూలో పెట్టడానికి, దాన్ని తెరిచి “కస్టమర్లు దీన్ని ఆర్డర్ చేయవచ్చు” ఆన్ చేయండి.",
    editDish: "వంటకం మార్చండి", addADish: "వంటకం జోడించండి", options: "వంటకం ఆప్షన్లు",
    editIntro: "మీరు సేవ్ చేసిన వెంటనే కస్టమర్లకు మార్పులు కనిపిస్తాయి.", newIntro: "ముఖ్యమైన వివరాలు నింపండి. తర్వాత ఏదైనా మార్చుకోవచ్చు.",
    photos: "ఫోటోలు", photosNote: "కస్టమర్లకు మొదటి ఫోటో కనిపిస్తుంది. 5 వరకు.", gallery: "ఫోటో గ్యాలరీ",
    dishPhotos: "వంటకం ఫోటోలు: ", addPhoto: "ఫోటో జోడించండి",
    photoType: "8 MB లోపు JPEG, PNG లేదా WebP ఫోటో ఎంచుకోండి.", photoLimit: "ఒక్కో వంటకానికి {count} ఫోటోల వరకు జోడించవచ్చు.",
    savedPhoto: "సేవ్ చేసిన ఫోటో {number}", cover: "ముఖ్య ఫోటో", makeCover: "ముఖ్య ఫోటో చేయండి", makeCoverLabel: "సేవ్ చేసిన ఫోటో {number}ను ముఖ్య ఫోటో చేయండి",
    removeSaved: "సేవ్ చేసిన ఫోటో {number} తీసేయండి", preview: "వంటకం ఫోటో", newPhoto: "కొత్త ఫోటో {name}",
    coverNew: "ముఖ్య ఫోటో · కొత్తది", new: "కొత్తది", remove: "{name} తీసేయండి",
    photoCount: "{count}/{max} ఫోటోలు", photoNow: "సేవ్ చేసిన ఫోటో తీసేయడం లేదా ముఖ్య ఫోటో మార్చడం వెంటనే జరుగుతుంది.",
    about: "వంటకం గురించి", dishName: "వంటకం పేరు", namePlaceholder: "ఉదాహరణకు, Chicken dum biryani",
    foodType: "ఆహార రకం", description: "వివరణ", optional: "(తప్పనిసరి కాదు)",
    descriptionPlaceholder: "దీని ప్రత్యేకత ఏంటి: మసాలా, బియ్యం, మీరు వండే విధానం",
    priceAndPortion: "ధర, పరిమాణం", price: "ధర", pricePlaceholder: "ఉదా. 180",
    serves: "ఎంతమందికి", servesHint: "(మంది, తప్పనిసరి కాదు)", fewer: "ఒకరు తక్కువ", more: "ఒకరు ఎక్కువ", servesNotSet: "ఇవ్వలేదు",
    readyIn: "సిద్ధమయ్యే సమయం", readyHint: "(నిమిషాలు, తప్పనిసరి కాదు)", readyPlaceholder: "ఉదా. 30", cookingTimes: "సాధారణ వంట సమయాలు",
    hour: "1 గంట", minutes: "{minutes} నిమి", spiceLevel: "కారం ఎంత",
    packing: "డెలివరీ కోసం ప్యాకింగ్", packedWeight: "ప్యాక్ బరువు", weightLabel: "ప్యాక్ చేసిన బరువు (గ్రాములు)",
    weightHelp: "బాక్స్‌తో సహా ఒక ప్యాక్ బరువు. డెలివరీ వ్యక్తికి ఇది కావాలి.", weightPlaceholder: "ఉదా. 500",
    weights: "సాధారణ ప్యాక్ బరువులు", grams: "{value} గ్రా", kilograms: "{value} కి.గ్రా",
    thermal: "థర్మల్ బాక్స్ కావాలి", thermalHelp: "దారిలో ఈ వంటకం వేడిగా లేదా చల్లగా ఉండాలంటే ఆన్ చేయండి.",
    canOrder: "కస్టమర్లు దీన్ని ఆర్డర్ చేయవచ్చు", onWhenSaved: "మీరు సేవ్ చేయగానే ఈ వంటకం మీ మెనూలోకి వస్తుంది.",
    draftUntil: "మీరు అమ్మడానికి సిద్ధమయ్యే వరకు డ్రాఫ్ట్‌గా సేవ్ అవుతుంది.", hiddenUntil: "మీరు ఇది ఆన్ చేసే వరకు కస్టమర్లకు కనిపించదు.",
    reloadCheck: "సేవ్ అయిందో చూడటానికి మెనూ మళ్లీ లోడ్ చేయండి", customersSee: "కస్టమర్లకు ఇలా కనిపిస్తుంది", namePreview: "మీ వంటకం పేరు",
    cancel: "రద్దు చేయండి", saving: "సేవ్ అవుతోంది…", saveDish: "సేవ్ చేయండి",
    deleteTitle: "{name} తొలగించాలా?", thisDish: "ఈ వంటకం",
    deleteText: "ఇక కస్టమర్లకు ఇది కనిపించదు. ఇది మీల్ ప్లాన్‌లో ఉంటే, ముందు ప్లాన్ మార్చండి.",
    deleting: "తొలగిస్తున్నాం…", deleteDish: "వంటకం తొలగించండి", duplicate: "వంటకం కాపీ చేయండి", duplicateText: "అవే వివరాలతో కొత్త డ్రాఫ్ట్",
    discardChanges: "మీ మార్పులు వదిలేయాలా?", discardDish: "ఈ వంటకం వదిలేయాలా?", discardText: "ఇక్కడ మీరు నింపినది పోతుంది.",
    discard: "వదిలేయండి", keepEditing: "మార్చడం కొనసాగించండి",
  },
  kn: {
    menu: "ಮೆನು", VEG: "ವೆಜ್", NON_VEG: "ನಾನ್-ವೆಜ್", EGG: "ಎಗ್",
    MILD: "ಕಡಿಮೆ ಖಾರ", MEDIUM: "ಮಧ್ಯಮ ಖಾರ", SPICY: "ಹೆಚ್ಚು ಖಾರ", spiceNotSet: "ಆಯ್ಕೆ ಮಾಡಿಲ್ಲ",
    draft: "ಡ್ರಾಫ್ಟ್ · ನಿಮ್ಮ ಮೆನುವಿನಲ್ಲಿ ಇಲ್ಲ", notOnMenu: "ನಿಮ್ಮ ಮೆನುವಿನಲ್ಲಿ ಇಲ್ಲ", onSale: "ಮಾರಾಟಕ್ಕಿದೆ", hidden: "ಗ್ರಾಹಕರಿಗೆ ಕಾಣುವುದಿಲ್ಲ",
    kitchenCheckFailed: "ನಿಮ್ಮ ಅಡುಗೆಮನೆಯನ್ನು ಪರಿಶೀಲಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", kitchenInvalid: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ವಿವರಗಳನ್ನು ಖಚಿತಪಡಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    menuLoadFailed: "ನಿಮ್ಮ ಮೆನು ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", menuIncomplete: "ಮೆನು ವಿವರಗಳು ಪೂರ್ತಿ ಬರಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    menuUnreachable: "ನಿಮ್ಮ ಮೆನುಗೆ ಸಂಪರ್ಕಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    nameRequired: "ನಿಮ್ಮ ಖಾದ್ಯಕ್ಕೆ ಹೆಸರು ನೀಡಿ.", categoryRequired: "ಒಂದು ವಿಭಾಗ ಆಯ್ಕೆಮಾಡಿ, ಅಥವಾ ನೀವೇ ಟೈಪ್ ಮಾಡಿ.", foodTypeRequired: "ವೆಜ್, ನಾನ್-ವೆಜ್ ಅಥವಾ ಎಗ್ ಆಯ್ಕೆಮಾಡಿ.",
    priceInvalid: "ಸೊನ್ನೆಗಿಂತ ಹೆಚ್ಚು ಬೆಲೆ ನೀಡಿ. ಪಾಯಿಂಟ್ ನಂತರ 2 ಅಂಕೆಗಳವರೆಗೆ ಮಾತ್ರ.",
    wholeNumber: "{label}: 1 ರಿಂದ 100,000 ವರೆಗಿನ ಪೂರ್ಣ ಸಂಖ್ಯೆ ನೀಡಿ.", weightRequired: "ಪ್ಯಾಕ್ ಮಾಡಿದ ತೂಕವನ್ನು ಗ್ರಾಂನಲ್ಲಿ ನೀಡಿ.",
    saveUnconfirmed: "ಉಳಿಸಲಾಗಿದೆಯೇ ಎಂದು ಖಚಿತವಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸುವ ಮೊದಲು ನಿಮ್ಮ ಮೆನು ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ.",
    saveIncomplete: "ಉಳಿಸಿದ ವಿವರಗಳು ಪೂರ್ತಿ ಬರಲಿಲ್ಲ. ಏನಾಯಿತು ನೋಡಲು ಮೆನು ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ.",
    photoUploadFailed: "ಫೋಟೋ ಅಪ್‌ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    photoUploadUnconfirmed: "ಫೋಟೋ ಅಪ್‌ಲೋಡ್ ಆಯಿತೇ ಎಂದು ಖಚಿತವಾಗಲಿಲ್ಲ. ನೋಡಲು ಮೆನು ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ.",
    dishAdded: "ಖಾದ್ಯ ಸೇರಿಸಲಾಗಿದೆ", changesSaved: "ಬದಲಾವಣೆಗಳನ್ನು ಉಳಿಸಲಾಗಿದೆ",
    connectionLost: "ಸಂಪರ್ಕ ಕಡಿತವಾಯಿತು. ಏನಾಯಿತು ನೋಡಲು ಮೆನು ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ.",
    photoNotSaved: "ಖಾದ್ಯದ ವಿವರಗಳನ್ನು ಉಳಿಸಲಾಗಿದೆ, ಆದರೆ ಒಂದು ಫೋಟೋ ಅಪ್‌ಲೋಡ್ ಆಯಿತೇ ಎಂದು ಖಚಿತವಾಗಲಿಲ್ಲ. ಇನ್ನೂ “ಹೊಸದು” ಎಂದಿರುವ ಫೋಟೋಗಳು ಅಪ್‌ಲೋಡ್ ಆಗಿಲ್ಲ. {detail}",
    availabilityUnconfirmed: "ಖಾದ್ಯ ಆನ್/ಆಫ್ ಆಯಿತೇ ಎಂದು ಖಚಿತವಾಗಲಿಲ್ಲ. ನೋಡಲು ಮೆನು ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ.",
    availabilityIncomplete: "ಖಾದ್ಯ ಆನ್/ಆಫ್ ವಿವರಗಳು ಪೂರ್ತಿ ಬರಲಿಲ್ಲ. ನೋಡಲು ಮೆನು ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ.",
    availabilityFailed: "ಖಾದ್ಯ ಆನ್/ಆಫ್ ಬದಲಾವಣೆ ಖಚಿತವಾಗಲಿಲ್ಲ. ನೋಡಲು ಮೆನು ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ.",
    turnedOn: "ಖಾದ್ಯ ಆನ್ ಮಾಡಲಾಗಿದೆ", turnedOff: "ಖಾದ್ಯ ಆಫ್ ಮಾಡಲಾಗಿದೆ",
    deleteRefused: "{name} ಅಳಿಸಲಾಗಲಿಲ್ಲ. ಅದು ಮೀಲ್ ಪ್ಲಾನ್‌ನಲ್ಲಿ ಇದ್ದರೆ, ಮೊದಲು ಪ್ಲಾನ್ ಬದಲಾಯಿಸಿ.",
    deleteSoon: "ಖಾದ್ಯಗಳನ್ನು ಅಳಿಸುವುದು ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿದೆ.", deleted: "{name} ಅಳಿಸಲಾಗಿದೆ",
    photoChangeUnconfirmed: "ಫೋಟೋ ಬದಲಾವಣೆ ಆಯಿತೇ ಎಂದು ಖಚಿತವಾಗಲಿಲ್ಲ. ನೋಡಲು ಮೆನು ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ.",
    photoChangeIncomplete: "ಫೋಟೋ ಬದಲಾವಣೆಯ ವಿವರಗಳು ಪೂರ್ತಿ ಬರಲಿಲ್ಲ. ನೋಡಲು ಮೆನು ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ.",
    photoChangeFailed: "ಫೋಟೋ ಬದಲಾವಣೆ ಖಚಿತವಾಗಲಿಲ್ಲ. ನೋಡಲು ಮೆನು ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ.",
    photoRemoved: "ಫೋಟೋ ತೆಗೆದುಹಾಕಲಾಗಿದೆ", coverChanged: "ಮುಖ್ಯ ಫೋಟೋ ಬದಲಾಯಿಸಲಾಗಿದೆ",
    setUpFirst: "ಮೊದಲು ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಸಿದ್ಧಮಾಡಿ", setUpText: "ನಿಮ್ಮ ಅಡುಗೆಮನೆಯ ಹೆಸರು ಮತ್ತು ಪಿಕಪ್ ವಿಳಾಸ ಉಳಿಸಿ, ನಂತರ ನಿಮ್ಮ ಖಾದ್ಯಗಳನ್ನು ಸೇರಿಸಿ.",
    setUpKitchen: "ಅಡುಗೆಮನೆ ಸಿದ್ಧಮಾಡಿ", checkAgain: "ಮತ್ತೆ ನೋಡಿ",
    loadingDishes: "ನಿಮ್ಮ ಖಾದ್ಯಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ…", countOne: "{count} ಖಾದ್ಯ · ಈಗ ಮಾರಾಟದಲ್ಲಿ {onSale}", countMany: "{count} ಖಾದ್ಯಗಳು · ಈಗ ಮಾರಾಟದಲ್ಲಿ {onSale}",
    intro: "ನಿಮ್ಮ ಅಡುಗೆಮನೆಯಿಂದ ಗ್ರಾಹಕರು ಆರ್ಡರ್ ಮಾಡಬಹುದಾದ ಖಾದ್ಯಗಳು.", addDish: "ಖಾದ್ಯ ಸೇರಿಸಿ",
    loadFailed: "ನಿಮ್ಮ ಮೆನು ಲೋಡ್ ಆಗಲಿಲ್ಲ", reloadMenu: "ಮೆನು ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ", loadingMenu: "ಮೆನು ಲೋಡ್ ಆಗುತ್ತಿದೆ",
    emptyImage: "ಮನೆಯ ಚೆಫ್ ಒಬ್ಬರು ಹೆಚ್ಚಿದ ತರಕಾರಿಗಳನ್ನು ಹಲಗೆಯಿಂದ ಒಲೆಯ ಮೇಲಿನ ಪಾತ್ರೆಗೆ ಹಾಕುತ್ತಿದ್ದಾರೆ",
    firstDish: "ನಿಮ್ಮ ಮೊದಲ ಖಾದ್ಯ ಸೇರಿಸಿ", firstDishText: "ನೀವು ಆಗಾಗ ಮಾಡುವ ಅಡುಗೆಯಿಂದ ಶುರುಮಾಡಿ. ಫೋಟೋ, ಬೆಲೆ ಮತ್ತು ಪ್ಯಾಕ್ ತೂಕ — ಗ್ರಾಹಕರಿಗೆ ಇಷ್ಟೇ ಸಾಕು.",
    noDishOnTitle: "ಇಂದು ಯಾವ ಖಾದ್ಯವೂ ಆನ್ ಇಲ್ಲ", noDishOnText: "ಗ್ರಾಹಕರು ಆರ್ಡರ್ ಮಾಡಲಾಗದು. ಇಂದು ಮಾಡುವ ಖಾದ್ಯಗಳನ್ನು ಆನ್ ಮಾಡಿ.",
    limits: "ದಿನದ ಮಿತಿ", limitsMeta: "ದಿನಕ್ಕೆ ನೀವು ಎಷ್ಟು ಪ್ಲೇಟ್ ಅಡುಗೆ ಮಾಡಬಹುದು",
    showDishes: "ತೋರಿಸಬೇಕಾದ ಖಾದ್ಯಗಳು", all: "ಎಲ್ಲಾ", filterOn: "ಮಾರಾಟಕ್ಕಿರುವವು", notOnSale: "ಮಾರಾಟಕ್ಕಿಲ್ಲದವು",
    groupOne: "{category}, {count} ಖಾದ್ಯ", groupMany: "{category}, {count} ಖಾದ್ಯಗಳು",
    editName: "{name} ಬದಲಾಯಿಸಿ", servesCount: "{count} ಜನರಿಗೆ", available: "{name} — ಗ್ರಾಹಕರು ಆರ್ಡರ್ ಮಾಡಬಹುದು",
    draftNote: "ಡ್ರಾಫ್ಟ್ ಖಾದ್ಯವನ್ನು ಮೆನುಗೆ ಸೇರಿಸಲು, ಅದನ್ನು ತೆರೆದು “ಗ್ರಾಹಕರು ಇದನ್ನು ಆರ್ಡರ್ ಮಾಡಬಹುದು” ಆನ್ ಮಾಡಿ.",
    editDish: "ಖಾದ್ಯ ಬದಲಾಯಿಸಿ", addADish: "ಖಾದ್ಯ ಸೇರಿಸಿ", options: "ಖಾದ್ಯದ ಆಯ್ಕೆಗಳು",
    editIntro: "ನೀವು ಉಳಿಸಿದ ತಕ್ಷಣ ಗ್ರಾಹಕರಿಗೆ ಬದಲಾವಣೆಗಳು ಕಾಣುತ್ತವೆ.", newIntro: "ಮುಖ್ಯ ವಿವರಗಳನ್ನು ತುಂಬಿ. ನಂತರ ಯಾವುದನ್ನಾದರೂ ಬದಲಾಯಿಸಬಹುದು.",
    photos: "ಫೋಟೋಗಳು", photosNote: "ಗ್ರಾಹಕರಿಗೆ ಮೊದಲ ಫೋಟೋ ಕಾಣುತ್ತದೆ. 5 ರವರೆಗೆ.", gallery: "ಫೋಟೋ ಗ್ಯಾಲರಿ",
    dishPhotos: "ಖಾದ್ಯದ ಫೋಟೋಗಳು: ", addPhoto: "ಫೋಟೋ ಸೇರಿಸಿ",
    photoType: "8 MB ಒಳಗಿನ JPEG, PNG ಅಥವಾ WebP ಫೋಟೋ ಆಯ್ಕೆಮಾಡಿ.", photoLimit: "ಪ್ರತಿ ಖಾದ್ಯಕ್ಕೆ {count} ಫೋಟೋಗಳವರೆಗೆ ಸೇರಿಸಬಹುದು.",
    savedPhoto: "ಉಳಿಸಿದ ಫೋಟೋ {number}", cover: "ಮುಖ್ಯ ಫೋಟೋ", makeCover: "ಮುಖ್ಯ ಫೋಟೋ ಮಾಡಿ", makeCoverLabel: "ಉಳಿಸಿದ ಫೋಟೋ {number} ಅನ್ನು ಮುಖ್ಯ ಫೋಟೋ ಮಾಡಿ",
    removeSaved: "ಉಳಿಸಿದ ಫೋಟೋ {number} ತೆಗೆದುಹಾಕಿ", preview: "ಖಾದ್ಯದ ಫೋಟೋ", newPhoto: "ಹೊಸ ಫೋಟೋ {name}",
    coverNew: "ಮುಖ್ಯ ಫೋಟೋ · ಹೊಸದು", new: "ಹೊಸದು", remove: "{name} ತೆಗೆದುಹಾಕಿ",
    photoCount: "{count}/{max} ಫೋಟೋಗಳು", photoNow: "ಉಳಿಸಿದ ಫೋಟೋ ತೆಗೆಯುವುದು ಅಥವಾ ಮುಖ್ಯ ಫೋಟೋ ಬದಲಾಯಿಸುವುದು ತಕ್ಷಣ ಆಗುತ್ತದೆ.",
    about: "ಖಾದ್ಯದ ಬಗ್ಗೆ", dishName: "ಖಾದ್ಯದ ಹೆಸರು", namePlaceholder: "ಉದಾಹರಣೆಗೆ, Chicken dum biryani",
    foodType: "ಆಹಾರದ ಪ್ರಕಾರ", description: "ವಿವರಣೆ", optional: "(ಕಡ್ಡಾಯವಲ್ಲ)",
    descriptionPlaceholder: "ಇದರ ವಿಶೇಷತೆ ಏನು: ಮಸಾಲೆ, ಅಕ್ಕಿ, ನೀವು ಅಡುಗೆ ಮಾಡುವ ರೀತಿ",
    priceAndPortion: "ಬೆಲೆ ಮತ್ತು ಪ್ರಮಾಣ", price: "ಬೆಲೆ", pricePlaceholder: "ಉದಾ. 180",
    serves: "ಎಷ್ಟು ಜನರಿಗೆ", servesHint: "(ಜನರು, ಕಡ್ಡಾಯವಲ್ಲ)", fewer: "ಒಬ್ಬರು ಕಡಿಮೆ", more: "ಒಬ್ಬರು ಹೆಚ್ಚು", servesNotSet: "ನೀಡಿಲ್ಲ",
    readyIn: "ಸಿದ್ಧವಾಗುವ ಸಮಯ", readyHint: "(ನಿಮಿಷಗಳು, ಕಡ್ಡಾಯವಲ್ಲ)", readyPlaceholder: "ಉದಾ. 30", cookingTimes: "ಸಾಮಾನ್ಯ ಅಡುಗೆ ಸಮಯಗಳು",
    hour: "1 ಗಂಟೆ", minutes: "{minutes} ನಿಮಿ", spiceLevel: "ಖಾರ ಎಷ್ಟು",
    packing: "ಡೆಲಿವರಿಗಾಗಿ ಪ್ಯಾಕಿಂಗ್", packedWeight: "ಪ್ಯಾಕ್ ತೂಕ", weightLabel: "ಪ್ಯಾಕ್ ಮಾಡಿದ ತೂಕ (ಗ್ರಾಂ)",
    weightHelp: "ಬಾಕ್ಸ್ ಸಮೇತ ಒಂದು ಪ್ಯಾಕ್‌ನ ತೂಕ. ಡೆಲಿವರಿ ವ್ಯಕ್ತಿಗೆ ಇದು ಬೇಕು.", weightPlaceholder: "ಉದಾ. 500",
    weights: "ಸಾಮಾನ್ಯ ಪ್ಯಾಕ್ ತೂಕಗಳು", grams: "{value} ಗ್ರಾಂ", kilograms: "{value} ಕೆ.ಜಿ",
    thermal: "ಥರ್ಮಲ್ ಬಾಕ್ಸ್ ಬೇಕು", thermalHelp: "ದಾರಿಯಲ್ಲಿ ಈ ಖಾದ್ಯ ಬಿಸಿಯಾಗಿ ಅಥವಾ ತಣ್ಣಗೆ ಇರಬೇಕಾದರೆ ಆನ್ ಮಾಡಿ.",
    canOrder: "ಗ್ರಾಹಕರು ಇದನ್ನು ಆರ್ಡರ್ ಮಾಡಬಹುದು", onWhenSaved: "ನೀವು ಉಳಿಸಿದ ತಕ್ಷಣ ಈ ಖಾದ್ಯ ನಿಮ್ಮ ಮೆನುಗೆ ಸೇರುತ್ತದೆ.",
    draftUntil: "ನೀವು ಮಾರಾಟಕ್ಕೆ ಸಿದ್ಧವಾಗುವವರೆಗೆ ಡ್ರಾಫ್ಟ್ ಆಗಿ ಉಳಿಯುತ್ತದೆ.", hiddenUntil: "ನೀವು ಇದನ್ನು ಆನ್ ಮಾಡುವವರೆಗೆ ಗ್ರಾಹಕರಿಗೆ ಕಾಣುವುದಿಲ್ಲ.",
    reloadCheck: "ಉಳಿಸಲಾಗಿದೆಯೇ ನೋಡಲು ಮೆನು ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ", customersSee: "ಗ್ರಾಹಕರಿಗೆ ಹೀಗೆ ಕಾಣುತ್ತದೆ", namePreview: "ನಿಮ್ಮ ಖಾದ್ಯದ ಹೆಸರು",
    cancel: "ರದ್ದುಮಾಡಿ", saving: "ಉಳಿಸಲಾಗುತ್ತಿದೆ…", saveDish: "ಖಾದ್ಯ ಉಳಿಸಿ",
    deleteTitle: "{name} ಅಳಿಸಬೇಕೇ?", thisDish: "ಈ ಖಾದ್ಯ",
    deleteText: "ಇನ್ನು ಗ್ರಾಹಕರಿಗೆ ಇದು ಕಾಣುವುದಿಲ್ಲ. ಇದು ಮೀಲ್ ಪ್ಲಾನ್‌ನಲ್ಲಿ ಇದ್ದರೆ, ಮೊದಲು ಪ್ಲಾನ್ ಬದಲಾಯಿಸಿ.",
    deleting: "ಅಳಿಸಲಾಗುತ್ತಿದೆ…", deleteDish: "ಖಾದ್ಯ ಅಳಿಸಿ", duplicate: "ಖಾದ್ಯ ಕಾಪಿ ಮಾಡಿ", duplicateText: "ಅದೇ ವಿವರಗಳೊಂದಿಗೆ ಹೊಸ ಡ್ರಾಫ್ಟ್",
    discardChanges: "ನಿಮ್ಮ ಬದಲಾವಣೆಗಳನ್ನು ಬಿಡಬೇಕೇ?", discardDish: "ಈ ಖಾದ್ಯವನ್ನು ಬಿಡಬೇಕೇ?", discardText: "ಇಲ್ಲಿ ನೀವು ತುಂಬಿದ್ದು ಹೋಗುತ್ತದೆ.",
    discard: "ಬಿಟ್ಟುಬಿಡಿ", keepEditing: "ಬದಲಾಯಿಸುವುದನ್ನು ಮುಂದುವರಿಸಿ",
  },
});
type Text = (typeof TEXT)["en"];

type FormState = {
  id: string | null;
  itemName: string;
  description: string;
  category: string;
  foodType: FoodType | "";
  price: string;
  currency: string;
  servesCount: string;
  preparationTimeMinutes: string;
  spiceLevel: SpiceLevel | "";
  unitPackageWeightGrams: string;
  thermoboxRequired: boolean;
  available: boolean;
  status: MenuItemStatus;
};
type Field = keyof FormState | "photo";
type Filter = "all" | "on" | "off";
const EMPTY: FormState = {
  id: null,
  itemName: "",
  description: "",
  category: "",
  foodType: "",
  price: "",
  currency: "INR",
  servesCount: "",
  preparationTimeMinutes: "",
  spiceLevel: "",
  unitPackageWeightGrams: "",
  thermoboxRequired: false,
  available: false,
  status: "DRAFT",
};
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS = 5;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FOOD_TYPES = [
  { value: "VEG", color: "bg-[#2E7D32]", border: "border-[#2E7D32]" },
  { value: "NON_VEG", color: "bg-[#D92D20]", border: "border-[#D92D20]" },
  { value: "EGG", color: "bg-[#D99A00]", border: "border-[#D99A00]" },
] as const;
const SPICE_LEVELS = ["", "MILD", "MEDIUM", "SPICY"] as const;
// One tap fills the usual answers; the box still takes any number.
const READY_IN = [15, 30, 45, 60] as const;
const PACKED_WEIGHTS = [250, 500, 750, 1000] as const;
const FIELD = "mt-2 block min-h-12 w-full rounded-xl border bg-white px-4 text-base text-[#1A1A1A]";
const STEP_BUTTON =
  "grid h-12 w-12 shrink-0 place-items-center rounded-xl !border !border-[#D3D7DD] !bg-white !text-[#1A1A1A] !shadow-none active:scale-[0.96] disabled:opacity-40";
const PHOTO_REMOVE =
  "absolute -right-1.5 -top-1.5 grid size-8 min-h-8! min-w-8! place-items-center rounded-full !border-2 !border-white !bg-[#1A1A1A] p-0! !text-white !shadow-none";

function toForm(item: ChefMenuItem): FormState {
  return {
    ...item,
    price: String(item.price),
    description: item.description ?? "",
    servesCount: item.servesCount === null ? "" : String(item.servesCount),
    preparationTimeMinutes:
      item.preparationTimeMinutes === null ? "" : String(item.preparationTimeMinutes),
    spiceLevel: item.spiceLevel ?? "",
    unitPackageWeightGrams: String(item.unitPackageWeightGrams),
  };
}
/** Saved photos, cover first, in the order customers see them. */
function savedImages(item?: ChefMenuItem) {
  return [...(item?.images ?? [])].sort(
    (a, b) => Number(b.primary) - Number(a.primary) || a.sortOrder - b.sortOrder,
  );
}
function primaryImage(item?: ChefMenuItem) {
  return (
    item?.images.find((image) => image.primary)?.publicUrl ?? item?.images[0]?.publicUrl ?? null
  );
}
function requiresKitchen(response: Response, body: unknown): boolean {
  return (
    response.status === 400 &&
    !!body &&
    typeof body === "object" &&
    "code" in body &&
    body.code === "KITCHEN_PROFILE_REQUIRED"
  );
}

function apiError(response: Response, body: unknown, fallback: string) {
  return chefApiError(response, body, fallback);
}
/** ₹180, or ₹180.50 when there are paise. */
function priceText(price: number, currency: string) {
  const amount = Number.isInteger(price) ? String(price) : price.toFixed(2);
  return currency === "INR" ? `₹${amount}` : `${currency} ${amount}`;
}
function grams(value: number, text: Text) {
  return value >= 1000 && value % 1000 === 0
    ? format(text.kilograms, { value: value / 1000 })
    : format(text.grams, { value });
}
/** Known categories in the order customers browse them, then the chef's own, A to Z. */
function categoryOrder(name: string) {
  const index = DISH_CATEGORIES.findIndex(
    (category) => category.name === knownCategory(name)?.name,
  );
  return index === -1 ? DISH_CATEGORIES.length : index;
}
function FoodIndicator({ type }: { type: FoodType }) {
  const text = useText(TEXT);
  const food = FOOD_TYPES.find((option) => option.value === type)!;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden="true"
        className={`flex size-4 items-center justify-center rounded-[4px] border-[1.5px] ${food.border}`}
      >
        <span className={`size-2 rounded-full ${food.color}`} />
      </span>
      {text[type]}
    </span>
  );
}
function MenuStatus({ item }: { item: ChefMenuItem }) {
  const text = useText(TEXT);
  if (item.status === "DRAFT") return <ChefPill tone="warning">{text.draft}</ChefPill>;
  if (item.status !== "ACTIVE") return <ChefPill tone="muted">{text.notOnMenu}</ChefPill>;
  return item.available ? (
    <ChefPill tone="success">{text.onSale}</ChefPill>
  ) : (
    <ChefPill tone="muted">{text.hidden}</ChefPill>
  );
}
function QuickPicks({
  label,
  options,
  value,
  onPick,
  unit,
}: {
  label: string;
  options: readonly number[];
  value: string;
  onPick: (value: string) => void;
  unit: (value: number) => string;
}) {
  return (
    // Four equal columns keep every pick on one row under the field at phone width.
    <div role="group" aria-label={label} className="mt-2 grid grid-cols-4 gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className="chef-chip justify-center !px-2"
          aria-pressed={value.trim() === String(option)}
          onClick={() => onPick(String(option))}
        >
          {unit(option)}
        </button>
      ))}
    </div>
  );
}
function SettingRow({
  title,
  text,
  children,
}: {
  title: ReactNode;
  text: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-[0.9375rem] font-semibold text-[#1A1A1A]">{title}</span>
        <span className="mt-0.5 block text-sm leading-5 text-[#6B6B6B]">{text}</span>
      </span>
      {children}
    </div>
  );
}

export function ChefMenuManager() {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const [items, setItems] = useState<ChefMenuItem[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [baseline, setBaseline] = useState(JSON.stringify(EMPTY));
  const [editing, setEditing] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  /** The dish Discard copies next, when Duplicate asked first; otherwise Discard closes the form. */
  const copyAfterDiscard = useRef<ChefMenuItem | null>(null);
  /** Dish options: the menu, or the delete question in its place. */
  const [options, setOptions] = useState<"menu" | "delete" | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [kitchenRequired, setKitchenRequired] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [uncertainSave, setUncertainSave] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const previews = useMemo(() => imageFiles.map((file) => URL.createObjectURL(file)), [imageFiles]);
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = editing && (JSON.stringify(form) !== baseline || imageFiles.length > 0);

  const load = useCallback(async (initial = false): Promise<boolean> => {
    if (initial) setLoading(true);
    try {
      const kitchenResponse = await sessionFetch("/api/chef/kitchen", { cache: "no-store" });
      const kitchenBody: unknown = await kitchenResponse.json().catch(() => undefined);
      if (!kitchenResponse.ok)
        throw apiError(
          kitchenResponse,
          kitchenBody,
          text.kitchenCheckFailed,
        );
      if (kitchenBody === null) {
        setItems([]);
        setKitchenRequired(true);
        setLoadError("");
        return true;
      }
      if (!parseChefKitchen(kitchenBody))
        throw new ChefError(
          text.kitchenInvalid,
          "INVALID_KITCHEN_RESPONSE",
          0,
        );
      const response = await sessionFetch("/api/chef/menu", { cache: "no-store" });
      const body: unknown = await response.json().catch(() => null);
      if (requiresKitchen(response, body)) {
        setItems([]);
        setKitchenRequired(true);
        setLoadError("");
        return true;
      }
      if (!response.ok)
        throw apiError(response, body, text.menuLoadFailed);
      const next = parseChefMenuItems(body);
      if (!next)
        throw new ChefError(
          text.menuIncomplete,
          "INVALID_MENU_RESPONSE",
          0,
        );
      setItems(next);
      setKitchenRequired(false);
      setLoadError("");
      return true;
    } catch (error) {
      setLoadError(chefErrorText(error, text.menuUnreachable));
      return false;
    } finally {
      if (initial) setLoading(false);
    }
  }, [text]);
  useEffect(() => {
    void load(true);
  }, [load]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  function closeEditor() {
    setConfirmLeave(false);
    setEditing(false);
    setMessage("");
    if (uncertainSave) void load(true);
  }
  /** Cancel, the back link and phone Back: ask first when something would be lost. */
  function requestLeave(): boolean {
    if (busyRef.current) return false;
    if (dirty) {
      copyAfterDiscard.current = null;
      setConfirmLeave(true);
      return false;
    }
    closeEditor();
    return true;
  }
  // The dish form is its own screen to the phone: Back returns to the menu instead of leaving it.
  useOverlayHistory(editing, requestLeave);

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }
  /** Opens the dish form; a copy is a new draft filled from the dish, saved with the normal create. */
  function start(item?: ChefMenuItem, copy = false) {
    const next = !item
      ? EMPTY
      : copy
        // The copy's name is saved as the dish name customers read, so it stays English like the rest of the dish.
        ? { ...toForm(item), id: null, itemName: `Copy of ${item.itemName}`.slice(0, 180), available: false, status: "DRAFT" as const }
        : toForm(item);
    setForm(next);
    setBaseline(JSON.stringify(next));
    setImageFiles([]);
    setErrors({});
    setMessage("");
    setNotice("");
    setUncertainSave(false);
    setEditing(true);
    try {
      window.scrollTo({ top: 0 });
    } catch {
      // Older browsers keep their scroll position.
    }
  }
  function focusField(field: Field) {
    requestAnimationFrame(() => {
      const input = formRef.current?.querySelector<HTMLElement>(`[data-field="${field}"]`);
      input?.scrollIntoView?.({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
      input?.focus({ preventScroll: true });
    });
  }
  function fieldProps(field: Field) {
    return {
      id: `dish-${field}`,
      "data-field": field,
      "aria-invalid": !!errors[field],
      "aria-describedby": errors[field] ? `dish-${field}-error` : undefined,
    };
  }
  function errorText(field: Field) {
    return errors[field] ? (
      <p id={`dish-${field}-error`} className="chef-field-error">
        {errors[field]}
      </p>
    ) : null;
  }
  function validate() {
    const next: Partial<Record<Field, string>> = {};
    if (!form.itemName.trim()) next.itemName = text.nameRequired;
    if (!form.category.trim()) next.category = text.categoryRequired;
    if (!form.foodType) next.foodType = text.foodTypeRequired;
    if (
      !/^\d+(\.\d{1,2})?$/.test(form.price.trim()) ||
      Number(form.price) < 0.01 ||
      Number(form.price) > 10000000
    )
      next.price = text.priceInvalid;
    for (const [field, label, required] of [
      ["servesCount", text.serves, false],
      ["preparationTimeMinutes", text.readyIn, false],
      ["unitPackageWeightGrams", text.packedWeight, true],
    ] as const) {
      const value = form[field].trim();
      if (
        (required || value) &&
        (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100000)
      )
        // Only the packed weight is required, so an empty value here is always the weight.
        next[field] = value ? format(text.wholeNumber, { label }) : text.weightRequired;
    }
    // A rejected photo is never queued, so its message stays visible without blocking the save.
    setErrors(errors.photo ? { ...next, photo: errors.photo } : next);
    const first = Object.keys(next)[0] as Field | undefined;
    if (first) {
      focusField(first);
      return false;
    }
    return true;
  }
  function upsert(item: ChefMenuItem) {
    setItems((current) => [item, ...current.filter((entry) => entry.id !== item.id)]);
  }
  async function save() {
    if (busyRef.current || uncertainSave || !validate()) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    setNotice("");
    const creating = !form.id;
    let saved: ChefMenuItem | null = null;
    let confirmedRejection = false;
    const payload: ChefMenuItemInput = {
      itemName: form.itemName.trim(),
      description: form.description.trim() || null,
      category: form.category.trim(),
      foodType: form.foodType as FoodType,
      price: Number(form.price),
      currency: form.currency,
      servesCount: form.servesCount ? Number(form.servesCount) : null,
      preparationTimeMinutes: form.preparationTimeMinutes
        ? Number(form.preparationTimeMinutes)
        : null,
      spiceLevel: form.spiceLevel || null,
      unitPackageWeightGrams: Number(form.unitPackageWeightGrams),
      thermoboxRequired: form.thermoboxRequired,
      available: form.available,
      status: form.status,
    };
    try {
      const response = await sessionFetch(
        form.id ? `/api/chef/menu/${form.id}` : "/api/chef/menu",
        {
          method: creating ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        // Catalog checks selling eligibility before any menu write. Other 5xx
        // responses and interrupted requests still require a reload to avoid duplicates.
        confirmedRejection =
          (response.status >= 400 && response.status < 500) ||
          chefMenuFailure(response.status, body)?.code === "CATALOG_ELIGIBILITY_UNAVAILABLE";
        if (requiresKitchen(response, body)) {
          setItems([]);
          setKitchenRequired(true);
          setEditing(false);
        }
        throw apiError(
          response,
          body,
          text.saveUnconfirmed,
        );
      }
      saved = parseChefMenuItem(body);
      if (!saved)
        throw new ChefError(
          text.saveIncomplete,
          "INVALID_MENU_RESPONSE",
          0,
        );
      upsert(saved);
      setForm(toForm(saved));
      // Upload one at a time; each confirmed photo leaves the queue so a retry never duplicates it.
      const pending = [...imageFiles];
      for (const file of pending) {
        const data = new FormData();
        // Customers download photos at upload size: send a 1600 px copy, not the phone original.
        data.set("file", await shrinkPhoto(file));
        data.set("primary", "false");
        const upload = await sessionFetch(`/api/chef/menu/${saved.id}/images`, {
          method: "POST",
          body: data,
        });
        const imageBody: unknown = await upload.json().catch(() => null);
        if (!upload.ok)
          throw apiError(upload, imageBody, text.photoUploadFailed);
        if (
          !imageBody ||
          typeof imageBody !== "object" ||
          !("uploaded" in imageBody) ||
          imageBody.uploaded !== true
        )
          throw new ChefError(
            text.photoUploadUnconfirmed,
            "INVALID_MENU_IMAGE_RESPONSE",
            0,
          );
        setImageFiles((current) => current.filter((entry) => entry !== file));
      }
      setEditing(false);
      setNotice(creating ? text.dishAdded : text.changesSaved);
      await load();
    } catch (error) {
      const detail = chefErrorText(
        error,
        text.connectionLost,
      );
      if (saved) {
        setMessage(format(text.photoNotSaved, { detail }));
        // Show photos that did upload before the failure.
        await load();
      } else {
        setMessage(detail);
        if (!confirmedRejection) setUncertainSave(true);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function setAvailability(item: ChefMenuItem, available: boolean) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    setNotice("");
    try {
      const response = await sessionFetch(`/api/chef/menu/${item.id}/availability`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ available, reason: null }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (requiresKitchen(response, body)) {
          setItems([]);
          setKitchenRequired(true);
        }
        throw apiError(
          response,
          body,
          text.availabilityUnconfirmed,
        );
      }
      const updated = parseChefMenuItem(body);
      if (!updated)
        throw new ChefError(
          text.availabilityIncomplete,
          "INVALID_MENU_RESPONSE",
          0,
        );
      upsert(updated);
      setNotice(updated.available ? text.turnedOn : text.turnedOff);
    } catch (error) {
      setMessage(
        chefErrorText(error, text.availabilityFailed),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function deleteDish() {
    const dish = items.find((item) => item.id === form.id);
    if (!dish || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    setNotice("");
    const refused = format(text.deleteRefused, { name: dish.itemName });
    try {
      const response = await sessionFetch(`/api/chef/menu/${dish.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        setOptions(null);
        if (isFeatureUnavailable(response.status, body)) setMessage(text.deleteSoon);
        else setMessage(chefErrorText(apiError(response, body, refused), refused));
        return;
      }
      setItems((current) => current.filter((item) => item.id !== dish.id));
      setOptions(null);
      closeEditor();
      setNotice(format(text.deleted, { name: dish.itemName }));
    } catch (error) {
      setOptions(null);
      setMessage(chefErrorText(error, refused));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  /** Saved photos change right away (not on Save Dish): remove one, or make it the cover. */
  async function changeSavedPhoto(imageId: string, action: "remove" | "cover") {
    if (busyRef.current || !form.id) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    setNotice("");
    try {
      const response = await sessionFetch(`/api/chef/menu/${form.id}/images/${imageId}`, {
        method: action === "remove" ? "DELETE" : "PUT",
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw apiError(
          response,
          body,
          text.photoChangeUnconfirmed,
        );
      const updated = parseChefMenuItem(body);
      if (!updated)
        throw new ChefError(
          text.photoChangeIncomplete,
          "INVALID_MENU_RESPONSE",
          0,
        );
      upsert(updated);
      setNotice(action === "remove" ? text.photoRemoved : text.coverChanged);
    } catch (error) {
      setMessage(
        chefErrorText(
          error,
          text.photoChangeFailed,
        ),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const existingPhotos = savedImages(items.find((item) => item.id === form.id));
  const photoSlots = MAX_PHOTOS - existingPhotos.length - imageFiles.length;
  // They float above the tab bar (or the Save bar), so one pair serves the list and the dish form,
  // and "Dish added" is still read out when saving closes the form.
  const feedback = (
    <>
      <ChefFlash message={notice} onClose={() => setNotice("")} />
      <ChefFlash message={message} tone="danger" onClose={() => setMessage("")} />
    </>
  );

  const onSale = items.filter((item) => item.status === "ACTIVE" && item.available).length;
  // Dishes grouped the way customers browse: by category, in Home's order, then the chef's own.
  const groups = useMemo(() => {
    const byCategory = new Map<string, ChefMenuItem[]>();
    for (const item of items) {
      const live = item.status === "ACTIVE" && item.available;
      if (filter !== "all" && (filter === "on") !== live) continue;
      const name = knownCategory(item.category)?.name ?? item.category.trim();
      byCategory.set(name, [...(byCategory.get(name) ?? []), item]);
    }
    return [...byCategory].sort(
      ([a], [b]) => categoryOrder(a) - categoryOrder(b) || a.localeCompare(b),
    );
  }, [items, filter]);

  if (kitchenRequired && !loading && !loadError)
    return (
      <div className="mx-auto w-full max-w-3xl">
        <ChefPageHead title={text.menu} />
        <ChefSection>
          <ChefEmpty
            icon={Store}
            title={text.setUpFirst}
            text={text.setUpText}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/chef/kitchen" className="chef-btn is-primary">
                  {text.setUpKitchen}
                </Link>
                <button
                  type="button"
                  className="chef-btn"
                  disabled={busy || loading}
                  onClick={() => void load(true)}
                >
                  {text.checkAgain}
                </button>
              </div>
            }
          />
        </ChefSection>
      </div>
    );

  const coverPreview = existingPhotos[0]?.publicUrl ?? previews[0] ?? null;
  const food = FOOD_TYPES.find((option) => option.value === form.foodType);

  // The list comes back as it was; the dish form slides up as its own screen.
  return (
    <>
    {!editing ? (
    <div className="mx-auto w-full max-w-3xl">
      <ChefPageHead
        title={text.menu}
        subtitle={
          loading
            ? text.loadingDishes
            : items.length
              ? format(items.length === 1 ? text.countOne : text.countMany, { count: items.length, onSale })
              : text.intro
        }
        action={
          <button
            type="button"
            className="chef-btn is-primary"
            onClick={() => start()}
            disabled={loading || busy || !!loadError}
          >
            <Plus className="h-5 w-5" aria-hidden="true" /> {text.addDish}
          </button>
        }
      />
      <div className="chef-stack">
        <ChefMenuViews current="dishes" counts={{ dishes: loading || loadError ? undefined : items.length }} />
        {loadError ? (
          <ChefSection>
            <ChefEmpty
              icon={AlertTriangle}
              title={text.loadFailed}
              text={loadError}
              action={
                isChefAccessText(loadError) ? (
                  <ChefAccessRetry onRetry={() => void load(true)} />
                ) : (
                  <button
                    type="button"
                    className="chef-btn"
                    disabled={busy || loading}
                    onClick={() => void load(true)}
                  >
                    {text.reloadMenu}
                  </button>
                )
              }
            />
          </ChefSection>
        ) : null}
        {loading ? (
          <div aria-label={text.loadingMenu} role="status">
            <ChefMenuSkeleton />
          </div>
        ) : !loadError && items.length === 0 ? (
          <ChefSection>
            <ChefEmpty
              image={{
                src: "/landing-v20/images/story-grid/cook-fresh-pot.png",
                alt: text.emptyImage,
                width: 1696,
                height: 954,
              }}
              title={text.firstDish}
              text={text.firstDishText}
              action={
                <button type="button" className="chef-btn is-primary" onClick={() => start()}>
                  {text.firstDish}
                </button>
              }
            />
          </ChefSection>
        ) : items.length ? (
          <>
            {/* With no dish on, customers can't order anything, even from an open kitchen: say so first. */}
            {onSale === 0 ? (
              <div className="chef-fix-card is-urgent">
                <span className="chef-fix-card-icon"><ToggleRight className="h-5 w-5" aria-hidden="true" /></span>
                <h2 className="chef-fix-card-title">{text.noDishOnTitle}</h2>
                <p className="chef-fix-card-text">{text.noDishOnText}</p>
              </div>
            ) : null}
            <div className="chef-section chef-list">
              <Link href="/chef/capacity?from=menu" className="chef-row">
                <span className="chef-row-icon"><Gauge className="h-5 w-5" aria-hidden="true" /></span>
                <span className="chef-row-main">
                  <span className="chef-row-title block">{text.limits}</span>
                  <span className="chef-row-meta block">{text.limitsMeta}</span>
                </span>
                <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
              </Link>
            </div>
            {items.length > 4 && onSale > 0 && onSale < items.length ? (
              <div role="group" aria-label={text.showDishes} className="chef-chips">
                {(
                  [
                    ["all", text.all, items.length],
                    ["on", text.filterOn, onSale],
                    ["off", text.notOnSale, items.length - onSale],
                  ] as const
                ).map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    className="chef-chip"
                    aria-pressed={filter === key}
                    onClick={() => setFilter(key)}
                  >
                    {label} <span className="tabular-nums opacity-70">{count}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {groups.map(([category, dishes]) => (
              <section
                key={category}
                aria-label={format(dishes.length === 1 ? text.groupOne : text.groupMany, {
                  category: categoryLabel(category, language),
                  count: dishes.length,
                })}
                className="grid gap-2"
              >
                <h2 className="flex items-baseline gap-2 px-1 font-display text-[1.0625rem] font-bold tracking-tight text-[#1A1A1A]">
                  {categoryLabel(category, language)}
                  <span className="text-sm font-semibold text-[#6B6B6B]">{dishes.length}</span>
                </h2>
                <ul className="chef-section chef-list">
                  {dishes.map((item) => {
                    const live = item.status === "ACTIVE" && item.available;
                    const image = primaryImage(item);
                    return (
                      <li key={item.id} className="flex items-center gap-1 pr-3 md:pr-4">
                        <button
                          type="button"
                          className="chef-row min-w-0 flex-1 !border-0 !bg-transparent"
                          aria-label={format(text.editName, { name: item.itemName })}
                          onClick={() => start(item)}
                          disabled={busy}
                        >
                          <span className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-[14px] bg-[#F1F3F5]">
                            {image ? (
                              <img
                                src={image}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <UtensilsCrossed
                                className="absolute inset-0 m-auto h-6 w-6 text-[#8A8F98]"
                                aria-hidden="true"
                              />
                            )}
                          </span>
                          <span className="chef-row-main">
                            <span className="chef-row-title line-clamp-2 block">
                              {item.itemName}
                            </span>
                            <span className="chef-row-meta flex flex-wrap items-center gap-x-2.5 gap-y-1">
                              <FoodIndicator type={item.foodType} />
                              <span className="chef-amount font-semibold text-[#1A1A1A]">
                                {priceText(item.price, item.currency)}
                              </span>
                              {item.servesCount ? <span>{format(text.servesCount, { count: item.servesCount })}</span> : null}
                            </span>
                            <span className="mt-1.5 block">
                              <MenuStatus item={item} />
                            </span>
                          </span>
                        </button>
                        <AppleSwitch
                          tone="go"
                          size="md"
                          aria-label={format(text.available, { name: item.itemName })}
                          checked={live}
                          disabled={busy || item.status !== "ACTIVE"}
                          onCheckedChange={(value) => void setAvailability(item, value)}
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </>
        ) : null}
        {items.some((item) => item.status !== "ACTIVE") ? (
          <p className="text-[0.8125rem] leading-5 text-[#6B6B6B]">
            {text.draftNote}
          </p>
        ) : null}
      </div>
    </div>
  ) : (
    <motion.form
      ref={formRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="chef-dish-editor"
    >
      <header className="mb-4">
        <button
          type="button"
          className="chef-back-link !border-0 !bg-transparent !shadow-none"
          disabled={busy}
          onClick={requestLeave}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {text.menu}
        </button>
        <div className="flex items-start justify-between gap-3">
          <h1 className="chef-page-title">{form.id ? text.editDish : text.addADish}</h1>
          {form.id ? (
            <button
              type="button"
              className="chef-icon-button shrink-0 !border-0 !bg-transparent !p-0 !shadow-none"
              aria-label={text.options}
              aria-haspopup="dialog"
              disabled={busy}
              onClick={() => setOptions("menu")}
            >
              <Ellipsis className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <p className="chef-page-subtitle">
          {form.id
            ? text.editIntro
            : text.newIntro}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-6">
        <div className="chef-stack">
          <fieldset disabled={busy || uncertainSave} className="chef-stack min-w-0">
            <ChefSection title={text.photos} note={text.photosNote}>
              <ul
                className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 pt-1.5"
                aria-label={text.gallery}
              >
                {photoSlots > 0 ? (
                  <li className="shrink-0">
                    <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-[14px] border-[1.5px] border-dashed border-[#B9BEC5] bg-[#F7F8FA] text-center text-xs font-semibold text-[#1A1A1A] transition-[border-color,background-color] duration-150 focus-within:ring-2 focus-within:ring-[#1A1A1A] hover:border-[#1A1A1A] hover:bg-white">
                      <Camera className="size-6 text-[#6B6B6B]" aria-hidden="true" />
                      <span>
                        <span className="sr-only">{text.dishPhotos}</span>{text.addPhoto}
                      </span>
                      <input
                        {...fieldProps("photo")}
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(event) => {
                          const chosen = Array.from(event.target.files ?? []);
                          event.target.value = "";
                          if (!chosen.length) return;
                          const valid = chosen.filter(
                            (file) =>
                              IMAGE_TYPES.has(file.type) &&
                              file.size > 0 &&
                              file.size <= MAX_IMAGE_BYTES,
                          );
                          const accepted = valid.slice(0, Math.max(0, photoSlots));
                          setImageFiles((current) => [...current, ...accepted]);
                          setErrors((current) => ({
                            ...current,
                            photo:
                              valid.length < chosen.length
                                ? text.photoType
                                : accepted.length < valid.length
                                  ? format(text.photoLimit, { count: MAX_PHOTOS })
                                  : undefined,
                          }));
                        }}
                      />
                    </label>
                  </li>
                ) : null}
                {existingPhotos.map((image, index) => (
                  <li key={image.id} className="relative h-24 w-24 shrink-0">
                    <img
                      src={image.publicUrl ?? ""}
                      alt={format(text.savedPhoto, { number: index + 1 })}
                      className="h-full w-full rounded-[14px] object-cover"
                    />
                    {image.primary ? (
                      <span className="absolute bottom-1.5 left-1.5 rounded-full bg-[#1A1A1A] px-2 py-0.5 text-[0.6875rem] font-bold text-white">
                        {text.cover}
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={format(text.makeCoverLabel, { number: index + 1 })}
                        className="absolute bottom-1.5 left-1.5 min-h-7! min-w-0! rounded-full !border-0 !bg-white/95 px-2 py-0.5 text-[0.6875rem] font-bold !text-[#1A1A1A] !shadow-[0_1px_4px_rgba(26,26,26,0.2)]"
                        onClick={() => void changeSavedPhoto(image.id, "cover")}
                      >
                        {text.makeCover}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={format(text.removeSaved, { number: index + 1 })}
                      className={PHOTO_REMOVE}
                      onClick={() => void changeSavedPhoto(image.id, "remove")}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
                {imageFiles.map((file, index) => (
                  <li
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    className="relative h-24 w-24 shrink-0"
                  >
                    <img
                      src={previews[index]}
                      alt={
                        existingPhotos.length === 0 && index === 0
                          ? text.preview
                          : format(text.newPhoto, { name: file.name })
                      }
                      className="h-full w-full rounded-[14px] object-cover"
                    />
                    <span className="absolute bottom-1.5 left-1.5 rounded-full bg-white/95 px-2 py-0.5 text-[0.6875rem] font-bold text-[#1A1A1A] shadow-[0_1px_4px_rgba(26,26,26,0.2)]">
                      {existingPhotos.length === 0 && index === 0 ? text.coverNew : text.new}
                    </span>
                    <button
                      type="button"
                      aria-label={format(text.remove, { name: file.name })}
                      className={PHOTO_REMOVE}
                      onClick={() =>
                        setImageFiles((current) => current.filter((entry) => entry !== file))
                      }
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[#6B6B6B]">
                <span aria-live="polite">
                  {format(text.photoCount, { count: existingPhotos.length + imageFiles.length, max: MAX_PHOTOS })}
                </span>
                {existingPhotos.length ? (
                  <span> · {text.photoNow}</span>
                ) : null}
              </p>
              {errorText("photo")}
            </ChefSection>

            <ChefSection title={text.about}>
              <div className="grid gap-5">
                <div>
                  <label htmlFor="dish-itemName" className="chef-field-label">
                    {text.dishName}
                  </label>
                  <input
                    {...fieldProps("itemName")}
                    required
                    maxLength={180}
                    autoComplete="off"
                    className={FIELD}
                    value={form.itemName}
                    onChange={(event) => update("itemName", event.target.value)}
                    placeholder={text.namePlaceholder}
                  />
                  {errorText("itemName")}
                </div>
                <div>
                  <ChefCategoryPicker
                    id="dish-category"
                    value={form.category}
                    onChange={(category) => update("category", category)}
                    invalid={!!errors.category}
                    describedBy={errors.category ? "dish-category-error" : undefined}
                  />
                  {errorText("category")}
                </div>
                <fieldset>
                  <legend className="chef-field-label">{text.foodType}</legend>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {FOOD_TYPES.map((option, index) => (
                      <label
                        key={option.value}
                        className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border bg-white px-2 text-[0.9375rem] font-semibold transition-[border-color,box-shadow] duration-150 focus-within:ring-2 focus-within:ring-[#1A1A1A] focus-within:ring-offset-1 ${
                          form.foodType === option.value
                            ? "border-[#1A1A1A] shadow-[inset_0_0_0_1px_#1A1A1A]"
                            : errors.foodType
                              ? "border-[#C4200F]"
                              : "border-[#D3D7DD] hover:border-[#1A1A1A]"
                        }`}
                      >
                        <input
                          {...(index === 0 ? fieldProps("foodType") : {})}
                          type="radio"
                          required
                          name="foodType"
                          value={option.value}
                          checked={form.foodType === option.value}
                          onChange={() => update("foodType", option.value)}
                          className="sr-only"
                        />
                        <FoodIndicator type={option.value} />
                      </label>
                    ))}
                  </div>
                  {errorText("foodType")}
                </fieldset>
                <div>
                  <label htmlFor="dish-description" className="chef-field-label">
                    {text.description} <span className="font-normal text-[#6B6B6B]">{text.optional}</span>
                  </label>
                  <textarea
                    id="dish-description"
                    maxLength={2000}
                    rows={3}
                    className={`${FIELD} py-3 leading-6`}
                    value={form.description}
                    onChange={(event) => update("description", event.target.value)}
                    placeholder={text.descriptionPlaceholder}
                  />
                </div>
              </div>
            </ChefSection>

            <ChefSection title={text.priceAndPortion}>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="dish-price" className="chef-field-label">
                    {text.price}
                  </label>
                  <div className="relative">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 left-4 mt-2 flex items-center text-base font-semibold text-[#6B6B6B]"
                    >
                      {form.currency === "INR" ? "₹" : form.currency}
                    </span>
                    <input
                      {...fieldProps("price")}
                      required
                      inputMode="decimal"
                      className={`${FIELD} pl-9 font-semibold tabular-nums`}
                      value={form.price}
                      onChange={(event) => update("price", event.target.value)}
                      placeholder={text.pricePlaceholder}
                    />
                  </div>
                  {errorText("price")}
                </div>
                <div>
                  <label htmlFor="dish-servesCount" className="chef-field-label">
                    {text.serves} <span className="font-normal text-[#6B6B6B]">{text.servesHint}</span>
                  </label>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={text.fewer}
                      className={STEP_BUTTON}
                      disabled={!form.servesCount || Number(form.servesCount) <= 1}
                      onClick={() =>
                        update(
                          "servesCount",
                          String(Math.max(1, (Number(form.servesCount) || 1) - 1)),
                        )
                      }
                    >
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <input
                      {...fieldProps("servesCount")}
                      inputMode="numeric"
                      className="block min-h-12 w-full min-w-0 rounded-xl border bg-white px-2 text-center text-base font-semibold tabular-nums text-[#1A1A1A]"
                      value={form.servesCount}
                      onChange={(event) => update("servesCount", event.target.value)}
                      placeholder={text.servesNotSet}
                    />
                    <button
                      type="button"
                      aria-label={text.more}
                      className={STEP_BUTTON}
                      onClick={() =>
                        update(
                          "servesCount",
                          String(Math.min(100, (Number(form.servesCount) || 0) + 1)),
                        )
                      }
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  {errorText("servesCount")}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="dish-preparationTimeMinutes" className="chef-field-label">
                    {text.readyIn} <span className="font-normal text-[#6B6B6B]">{text.readyHint}</span>
                  </label>
                  <input
                    {...fieldProps("preparationTimeMinutes")}
                    inputMode="numeric"
                    className={`${FIELD} sm:max-w-[12rem]`}
                    value={form.preparationTimeMinutes}
                    onChange={(event) => update("preparationTimeMinutes", event.target.value)}
                    placeholder={text.readyPlaceholder}
                  />
                  <QuickPicks
                    label={text.cookingTimes}
                    options={READY_IN}
                    value={form.preparationTimeMinutes}
                    onPick={(value) => update("preparationTimeMinutes", value)}
                    unit={(minutes) => (minutes === 60 ? text.hour : format(text.minutes, { minutes }))}
                  />
                  {errorText("preparationTimeMinutes")}
                </div>
                <div className="sm:col-span-2">
                  <ChefChoiceChips
                    legend={text.spiceLevel}
                    name="spiceLevel"
                    options={SPICE_LEVELS.map((value) => ({ value, label: value ? text[value] : text.spiceNotSet }))}
                    value={form.spiceLevel}
                    onChange={(value) => update("spiceLevel", value)}
                  />
                </div>
              </div>
            </ChefSection>

            <ChefSection title={text.packing}>
              <div>
                <label htmlFor="dish-unitPackageWeightGrams" className="chef-field-label">
                  {text.weightLabel}
                </label>
                <p className="mt-1 text-sm leading-5 text-[#6B6B6B]">
                  {text.weightHelp}
                </p>
                <input
                  {...fieldProps("unitPackageWeightGrams")}
                  required
                  inputMode="numeric"
                  className={`${FIELD} sm:max-w-[12rem]`}
                  value={form.unitPackageWeightGrams}
                  onChange={(event) => update("unitPackageWeightGrams", event.target.value)}
                  placeholder={text.weightPlaceholder}
                />
                <QuickPicks
                  label={text.weights}
                  options={PACKED_WEIGHTS}
                  value={form.unitPackageWeightGrams}
                  onPick={(value) => update("unitPackageWeightGrams", value)}
                  unit={(value) => grams(value, text)}
                />
                {errorText("unitPackageWeightGrams")}
              </div>
              <div className="mt-4 border-t border-[#E3E6EA] pt-3">
                <SettingRow
                  title={text.thermal}
                  text={text.thermalHelp}
                >
                  <AppleSwitch
                    tone="go"
                    size="md"
                    aria-label={text.thermal}
                    checked={form.thermoboxRequired}
                    onCheckedChange={(value) => update("thermoboxRequired", value)}
                  />
                </SettingRow>
              </div>
            </ChefSection>

            <ChefSection>
              <SettingRow
                title={text.canOrder}
                text={
                  form.available
                    ? text.onWhenSaved
                    : form.status === "DRAFT"
                      ? text.draftUntil
                      : text.hiddenUntil
                }
              >
                <AppleSwitch
                  tone="go"
                  size="md"
                  aria-label={text.canOrder}
                  checked={form.available}
                  onCheckedChange={(value) => {
                    update("available", value);
                    update(
                      "status",
                      value
                        ? "ACTIVE"
                        : (items.find((item) => item.id === form.id)?.status ?? "DRAFT"),
                    );
                  }}
                />
              </SettingRow>
            </ChefSection>
          </fieldset>
          {uncertainSave ? (
            <button
              type="button"
              className="chef-btn"
              onClick={() => {
                setEditing(false);
                void load(true);
              }}
            >
              {text.reloadCheck}
            </button>
          ) : null}
        </div>

        {/* What customers will see, while the chef fills it in. Wide screens only: phones keep one column. */}
        <aside aria-label={text.customersSee} className="hidden lg:sticky lg:top-24 lg:block">
          <p className="mb-2 px-1 text-sm font-semibold text-[#6B6B6B]">{text.customersSee}</p>
          <div className="overflow-hidden rounded-[18px] border border-[#E3E6EA] bg-white shadow-[0_12px_32px_rgba(26,26,26,0.08)]">
            <div className="relative aspect-[4/3] bg-[#F1F3F5]">
              {coverPreview ? (
                <img src={coverPreview} alt="" className="h-full w-full object-cover" />
              ) : (
                <UtensilsCrossed
                  className="absolute inset-0 m-auto h-8 w-8 text-[#8A8F98]"
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="grid gap-1.5 p-4">
              <p className="line-clamp-2 font-display text-lg font-bold leading-snug tracking-tight text-[#1A1A1A]">
                {form.itemName.trim() || text.namePreview}
              </p>
              <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-[#6B6B6B]">
                {food ? <FoodIndicator type={food.value} /> : null}
                {form.category.trim() ? <span>{categoryLabel(form.category, language)}</span> : null}
                {form.servesCount ? <span>{format(text.servesCount, { count: form.servesCount })}</span> : null}
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-[#1A1A1A]">
                {Number(form.price) > 0 ? priceText(Number(form.price), form.currency) : "₹—"}
              </p>
            </div>
          </div>
        </aside>
      </div>

      <div className="chef-dish-actions">
        <button type="button" className="chef-btn" disabled={busy} onClick={requestLeave}>
          {text.cancel}
        </button>
        <button
          type="submit"
          className="chef-btn is-primary flex-1"
          aria-busy={busy}
          disabled={busy || uncertainSave}
        >
          {busy ? text.saving : text.saveDish}
        </button>
      </div>

      <Sheet
        open={options !== null}
        onOpenChange={(open) => {
          if (!open) setOptions(null);
        }}
        busy={busy}
        title={options === "delete" ? format(text.deleteTitle, { name: items.find((item) => item.id === form.id)?.itemName ?? text.thisDish }) : text.options}
        description={options === "delete" ? text.deleteText : undefined}
        footer={
          options === "delete" ? (
            <>
              <button type="button" className={secondaryActionClass} disabled={busy} onClick={() => setOptions(null)}>
                {text.cancel}
              </button>
              <button type="button" className="craves-primary-action w-full sm:w-auto" aria-busy={busy} disabled={busy} onClick={() => void deleteDish()}>
                {busy ? text.deleting : text.deleteDish}
              </button>
            </>
          ) : undefined
        }
      >
        {options === "menu" ? (
          // Sheets open outside the chef page: the theme brings the chef colours along.
          <div className="chef-panel-theme chef-sheet-theme chef-list mt-4 overflow-hidden rounded-xl border border-[#E3E6EA]">
            <button
              type="button"
              className="chef-row w-full !rounded-none !border-0 !bg-transparent text-left"
              onClick={() => {
                const dish = items.find((item) => item.id === form.id);
                setOptions(null);
                if (!dish) return;
                if (!dirty) return start(dish, true);
                copyAfterDiscard.current = dish;
                setConfirmLeave(true);
              }}
            >
              <span className="chef-row-icon"><CopyPlus className="h-5 w-5" aria-hidden="true" /></span>
              <span className="chef-row-main">
                <span className="chef-row-title block">{text.duplicate}</span>
                <span className="chef-row-meta block">{text.duplicateText}</span>
              </span>
            </button>
            <button type="button" className="chef-row is-danger w-full !rounded-none !border-0 !bg-transparent text-left" onClick={() => setOptions("delete")}>
              <span className="chef-row-icon"><Trash2 className="h-5 w-5" aria-hidden="true" /></span>
              <span className="chef-row-main"><span className="chef-row-title block">{text.deleteDish}</span></span>
            </button>
          </div>
        ) : null}
      </Sheet>
      <Dialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title={form.id ? text.discardChanges : text.discardDish}
        description={text.discardText}
        footer={
          <>
            <button
              type="button"
              className={secondaryActionClass}
              onClick={() => {
                const dish = copyAfterDiscard.current;
                if (dish) {
                  setConfirmLeave(false);
                  start(dish, true);
                } else closeEditor();
              }}
            >
              {text.discard}
            </button>
            <button
              type="button"
              className="craves-primary-action w-full sm:w-auto"
              onClick={() => setConfirmLeave(false)}
            >
              {text.keepEditing}
            </button>
          </>
        }
      />
    </motion.form>
    )}
    {feedback}
    </>
  );
}
