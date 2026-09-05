import {
  type JSX,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import {
  LucideFingerprint,
  LucideLanguages,
  LucideLayoutGrid,
  LucideSettings2,
  LucideSidebarOpen,
  LucideUser,
  LucideUserRoundX,
  LucideX,
} from 'lucide-react';
import { useTableStyle } from '@/context/TableStyleContext';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useAuthContext } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import {
  emailValidator,
  passwordValidator,
  simpleZodResolver,
  userNameValidator,
} from '@/lib/validations/auth';
import { LoadingIndicator } from '../loading-indicator/LoadingIndicator';
import authService from '@/lib/auth';
import { toast } from 'sonner';
import { UserLocalStorage, type StartTarget } from '@/lib/userLocalStorage';
import { useDashboardContext } from '@/context/DashboardContext';
import { ProjectIcon } from '@/components/project-icon/ProjectIcon';

const OPEN_USER_SETTINGS_DIALOG_EVENT =
  'dadix--open-user-settingsList-:{settingsListdialog-event';

interface Setting {
  id: number;
  nameKey: string;
  icon: JSX.Element;
  content: JSX.Element;
}

const settingsList: Setting[] = [
  {
    id: 1,
    icon: <LucideUser />,
    nameKey: 'settings.account',
    content: <AccountSettings />,
  },
  {
    id: 2,
    icon: <LucideFingerprint />,
    nameKey: 'settings.password',
    content: <PasswordSettings />,
  },
  {
    id: 3,
    icon: <LucideLanguages />,
    nameKey: 'settings.language',
    content: <LanguageSettings />,
  },
  {
    id: 4,
    icon: <LucideSettings2 />,
    nameKey: 'settings.preferences',
    content: <PreferencesSettings />,
  },
  {
    id: 5,
    icon: <LucideLayoutGrid />,
    nameKey: 'settings.style',
    content: <StyleSettings />,
  },
  {
    id: 6,
    icon: <LucideUserRoundX />,
    nameKey: 'settings.removeAccount',
    content: <RemoveAccountSettings />,
  },
];

function UserSettingsDialog() {
  const { t } = useLanguage();
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [selectedSettingItemId, setSelectedSettingItemId] = useState<number>(1);

  const selectedSettingItem = useMemo(
    (): Setting | undefined =>
      settingsList.find(
        (settingItem) => settingItem.id === selectedSettingItemId
      ),
    [selectedSettingItemId]
  );

  useEffect(() => {
    window.addEventListener(
      OPEN_USER_SETTINGS_DIALOG_EVENT,
      handleOpenDialogEvent
    );
    return () => {
      window.removeEventListener(
        OPEN_USER_SETTINGS_DIALOG_EVENT,
        handleOpenDialogEvent
      );
    };
    function handleOpenDialogEvent(_evnt: Event) {
      if (isDialogOpen) return;
      setIsDialogOpen(true);
    }
  }, [isDialogOpen]);

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogContent
        showCloseButton={false}
        className='flex flex-row flex-nowrap gap-0 p-0 max-w-full max-h-full max-sm:h-full max-sm:w-full max-sm:rounded-none sm:max-w-[720px]! sm:w-[calc(100%-20px)]!'
      >
        <DialogTitle className='sr-only'>
          {selectedSettingItem ? t(selectedSettingItem.nameKey) : 'Settings'}
        </DialogTitle>
        <SettingsSidebar
          selectedSettingId={selectedSettingItemId}
          setSelectedSettingItemId={setSelectedSettingItemId}
          t={t}
        />
        <div className='grow shrink min-h-[60vh] max-h-[60vh]'>
          {selectedSettingItem && (
            <div className='content grow shrink p-2 px-4 min-h-full'>
              <div className='flex flex-row flex-nowrap justify-start items-center gap-2 h-[50px]'>
                <h3 className='p-0 m-0 text-2xl font-semibold'>
                  {t(selectedSettingItem.nameKey)}
                </h3>
              </div>
              <div className='flex flex-col gap-4 py-4'>
                {selectedSettingItem.content}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsSidebar({
  selectedSettingId,
  setSelectedSettingItemId,
  t,
}: {
  selectedSettingId: number;
  setSelectedSettingItemId: (
    _id: number | ((_currentId: number) => number)
  ) => void;
  t: (key: string) => string;
}) {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <div
      data-state={isOpen ? 'open' : 'closed'}
      className='flex flex-col grow-0 shrink-0 gap-2 sticky top-0 p-2 bg-accent/20 h-full w-[50px] data-[state=open]:w-full data-[state=open]:fixed data-[state=open]:bg-background sm:w-[220px] sm:min-h-[60vh] sm:max-h-[60vh] sm:h-[60vh] border-r z-9999'
    >
      <div className='flex flex-row flex-nowrap justify-start items-center gap-2 h-[50px]'>
        <DialogClose asChild>
          <Button variant='outline' size='icon' aria-label='Close settings'>
            <LucideX className='size-5' />
          </Button>
        </DialogClose>
      </div>
      <div className='flex flex-col gap-1 overflow-auto'>
        {settingsList.map((settingItem) => (
          <Button
            key={settingItem.id}
            data-selected={
              selectedSettingId === settingItem.id ? 'true' : 'false'
            }
            variant='ghost'
            onClick={() => {
              setSelectedSettingItemId(settingItem.id);
              setIsOpen(false);
            }}
            data-sidebarstate={isOpen ? 'open' : 'closed'}
            className='justify-start data-[selected=true]:bg-secondary data-[selected=true]:text-secondary-foreground data-[sidebarstate=closed]:justify-center sm:data-[sidebarstate=closed]:justify-start'
          >
            {settingItem.icon}
            <span
              data-sidebarstate={isOpen ? 'open' : 'closed'}
              className='data-[sidebarstate=closed]:hidden sm:data-[sidebarstate=closed]:inline'
            >
              {t(settingItem.nameKey)}
            </span>
          </Button>
        ))}
      </div>
      {!isOpen && (
        <div className='flex flex-row flex-nowrap justify-start items-center gap-2 mt-auto h-[50px] sm:hidden'>
          <Button
            variant='outline'
            size='icon'
            onClick={() => {
              setIsOpen(true);
            }}
          >
            <LucideSidebarOpen className='size-5' />
          </Button>
        </div>
      )}
    </div>
  );
}

function AccountSettings() {
  const authCtx = useAuthContext();
  const { t } = useLanguage();

  const userNameRef = useRef<string>('');
  const currentUserNameRef = useRef<string>('');
  const userEmailRef = useRef<string>('');
  const currentUserEmailRef = useRef<string>('');

  const [userName, setUserName] = useState<string>('');
  const [updatingUserName, setUpdatingUserName] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [updatingUserEmail, setUpdatingUserEmail] = useState<boolean>(false);

  const [userNameValidationError, setUserNameValidationError] =
    useState<string>('');
  const [userEmailValidationError, setUserEmailValidationError] =
    useState<string>('');

  useEffect(() => {
    userNameRef.current = userName;
  }, [userName]);

  useEffect(() => {
    userEmailRef.current = userEmail;
  }, [userEmail]);

  useEffect(() => {
    const { username, email } = authCtx.state.user || {};
    if (userNameRef.current !== username) {
      currentUserNameRef.current = username;
      setUserName(username);
    }
    if (userEmailRef.current !== email) {
      currentUserEmailRef.current = email;
      setUserEmail(email);
    }
  }, [authCtx.state.user]);

  const updateUserName = useCallback(() => {
    if (userNameValidationError) return;
    if (currentUserNameRef.current === userName) return;
    setUpdatingUserName(true);
    const newUserName = userName;
    authService
      .updateCurrentUser({ data: { username: userName } })
      .then((res) => {
        if (res?.status !== 200) {
          let errorMsg = 'Error updating user name';
          switch (res?.status) {
            case 409:
              errorMsg = 'User name allready exist';
              break;
          }
          throw new Error(errorMsg);
        }
        currentUserNameRef.current = newUserName;
        authCtx.methods.updateUser({
          username: newUserName,
        });
        setUpdatingUserName(false);
        return null;
      })
      .catch((err) => {
        setUpdatingUserName(false);
        toast.error(err.toString());
      });
  }, [userName, userNameValidationError]);

  const updateUserEmail = useCallback(() => {
    if (userEmailValidationError) return;
    if (currentUserEmailRef.current === userEmail) return;
    setUpdatingUserEmail(true);
    const newUserEmail = userEmail;
    authService
      .updateCurrentUser({ data: { email: userEmail } })
      .then((res) => {
        if (res?.status !== 200) {
          let errorMsg = 'Error updating email';
          switch (res?.status) {
            case 409:
              errorMsg = 'Email allready exist';
              break;
          }
          throw new Error(errorMsg);
        }
        currentUserEmailRef.current = newUserEmail;
        authCtx.methods.updateUser({
          email: newUserEmail,
        });
        setUpdatingUserEmail(false);
        return null;
      })
      .catch((err) => {
        setUpdatingUserEmail(false);
        toast.error(err.toString());
      });
  }, [userEmail, userEmailValidationError]);

  return (
    <>
      <div className='flex flex-col gap-2.5'>
        <Label className='font-semibold'>{t('settings.account.name')}</Label>
        <Input
          value={userName}
          onChange={(evnt) => {
            const newUserName = evnt.target.value;
            setUserName(newUserName);
            setUserNameValidationError(
              simpleZodResolver(newUserName, userNameValidator)
            );
          }}
          placeholder={t('settings.account.name')}
          disabled={updatingUserName}
        />
        {userNameValidationError.trim() && (
          <p className='px-1 text-xs text-destructive -my-2.5'>
            {userNameValidationError}
          </p>
        )}
        <Button
          onClick={updateUserName}
          className='self-end'
          disabled={updatingUserName}
        >
          {t('settings.account.updateName')}
        </Button>
      </div>
      <div className='flex flex-col items-start gap-2.5'>
        <Label className='font-semibold'>{t('settings.account.email')}</Label>
        <Input
          value={userEmail}
          onChange={(evnt) => {
            const newUserEmail = evnt.target.value;
            setUserEmail(newUserEmail);
            setUserEmailValidationError(
              simpleZodResolver(newUserEmail, emailValidator)
            );
          }}
          placeholder={t('settings.account.email')}
          disabled={updatingUserEmail}
        />
        {userEmailValidationError.trim() && (
          <p className='px-1 text-xs text-destructive -my-2.5'>
            {userEmailValidationError}
          </p>
        )}
        <Button
          onClick={updateUserEmail}
          className='self-end'
          disabled={updatingUserEmail}
        >
          {t('settings.account.updateEmail')}
        </Button>
      </div>
    </>
  );
}

function LanguageSettings() {
  const { locale, setLocale, t } = useLanguage();
  return (
    <div className='flex flex-col items-start gap-2.5 w-full'>
      <Label className='font-semibold'>{t('settings.language.label')}</Label>
      <Select
        value={locale}
        onValueChange={(value: 'en' | 'de') => setLocale(value)}
      >
        <SelectTrigger className='w-full'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='en'>{t('settings.language.en')}</SelectItem>
          <SelectItem value='de'>{t('settings.language.de')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function PasswordSettings() {
  const { t } = useLanguage();
  const oldPasswordRef = useRef<string>('');
  const newPasswordRef = useRef<string>('');

  const [updatingUserPassword, setUpdatingUserPassword] =
    useState<boolean>(false);

  const [oldPasswordValidationError, setOldPasswordValidationError] =
    useState<string>('');
  const [newPasswordValidationError, setNewPasswordValidationError] =
    useState<string>('');

  const updateUserPassword = useCallback(() => {
    if (oldPasswordValidationError || newPasswordValidationError) return;
    if (!oldPasswordRef.current || !newPasswordRef.current) return;
    if (oldPasswordRef.current === newPasswordRef.current) {
      toast.error(t('settings.password.sameError'));
      return;
    }
    setUpdatingUserPassword(true);
    authService
      .updateCurrentUser({
        password: oldPasswordRef.current,
        data: { password: newPasswordRef.current },
      })
      .then((res) => {
        if (res?.status !== 200) {
          throw new Error('Error updating user password');
        }
        setUpdatingUserPassword(false);
        return null;
      })
      .catch((err) => {
        setUpdatingUserPassword(false);
        toast.error(err.toString());
      });
  }, [oldPasswordValidationError, newPasswordValidationError, t]);

  return (
    <>
      <div className='flex flex-col items-start gap-4'>
        <div className='flex flex-col items-start gap-2.5 w-full'>
          <Label className='font-semibold'>{t('settings.password.old')}</Label>
          <Input
            autoComplete='none'
            placeholder={t('settings.password.placeholder')}
            type='password'
            onChange={(evnt) => {
              const oldPassword = evnt.target.value;
              oldPasswordRef.current = oldPassword;
            }}
            disabled={updatingUserPassword}
          />
          {oldPasswordValidationError.trim() && (
            <p className='px-1 text-xs text-destructive -my-2.5'>
              {oldPasswordValidationError}
            </p>
          )}
        </div>
        <div className='flex flex-col items-start gap-2.5 w-full'>
          <Label className='font-semibold'>{t('settings.password.new')}</Label>
          <Input
            autoComplete='none'
            placeholder={t('settings.password.new')}
            type='password'
            onChange={(evnt) => {
              const newPassword = evnt.target.value;
              newPasswordRef.current = newPassword;
              setNewPasswordValidationError(
                simpleZodResolver(newPassword, passwordValidator)
              );
            }}
            disabled={updatingUserPassword}
          />
          {newPasswordValidationError.trim() && (
            <p className='px-1 text-xs text-destructive -my-2.5'>
              {newPasswordValidationError}
            </p>
          )}
        </div>
        <Button
          onClick={updateUserPassword}
          className='self-end'
          disabled={updatingUserPassword}
        >
          {/*{updatingUserPassword && <LoadingIndicator visibilityDelay={false} />}*/}
          {t('settings.password.update')}
        </Button>
      </div>
    </>
  );
}

function StyleSettings() {
  const { t } = useLanguage();
  const { theme, setTheme } = useTableStyle();
  return (
    <div className='flex flex-col items-start gap-2.5 w-full'>
      <Label className='font-semibold'>{t('settings.style.theme')}</Label>
      <Select value={theme} onValueChange={(v) => setTheme(v as 'classic' | 'lineless' | 'panel')}>
        <SelectTrigger className='w-full'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='classic'>{t('settings.style.themeClassic')}</SelectItem>
          <SelectItem value='lineless'>{t('settings.style.themeLineless')}</SelectItem>
          <SelectItem value='panel'>{t('settings.style.themePanel')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function PreferencesSettings() {
  const { t } = useLanguage();
  const dashboardCtx = useDashboardContext();
  const [startTarget, setStartTarget] = useState<StartTarget>(() =>
    UserLocalStorage.getStartTarget()
  );
  const [startProjectId, setStartProjectId] = useState<string>(() =>
    UserLocalStorage.getStartProjectId() ?? ''
  );
  const [skipDeleteConfirmation, setSkipDeleteConfirmation] = useState<boolean>(() =>
    UserLocalStorage.getSkipDeleteConfirmation()
  );
  const [dateFormat, setDateFormat] = useState<string>(() =>
    UserLocalStorage.getDateFormat()
  );
  const [timeFormat, setTimeFormat] = useState<'24h' | '12h'>(() =>
    UserLocalStorage.getTimeFormat()
  );

  useEffect(() => {
    UserLocalStorage.setStartTarget(startTarget);
  }, [startTarget]);
  useEffect(() => {
    if (startTarget === 'project') {
      UserLocalStorage.setStartProjectId(startProjectId || '');
    }
  }, [startTarget, startProjectId]);
  useEffect(() => {
    UserLocalStorage.setSkipDeleteConfirmation(skipDeleteConfirmation);
  }, [skipDeleteConfirmation]);
  useEffect(() => {
    UserLocalStorage.setDateFormat(dateFormat);
  }, [dateFormat]);
  useEffect(() => {
    UserLocalStorage.setTimeFormat(timeFormat);
  }, [timeFormat]);

  const dateFormats = [
    'DD.MM.YYYY',
    'DD-MM-YYYY',
    'MM/DD/YYYY',
    'YYYY.MM.DD',
    'YYYY-MM-DD',
    'YYYY/MM/DD',
  ];
  const allProjects = useMemo(
    () => [...(dashboardCtx.projects ?? []), ...(dashboardCtx.sharedProjects ?? [])],
    [dashboardCtx.projects, dashboardCtx.sharedProjects]
  );

  return (
    <>
      <div className='flex flex-col items-start gap-2.5 w-full'>
        <Label className='font-semibold'>
          {t('settings.preferences.deleteConfirmation')}
        </Label>
        <Select
          value={skipDeleteConfirmation ? 'skip' : 'ask'}
          onValueChange={(v) => setSkipDeleteConfirmation(v === 'skip')}
        >
          <SelectTrigger className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='ask'>
              {t('settings.preferences.deleteConfirmationAskAlways')}
            </SelectItem>
            <SelectItem value='skip'>
              {t('settings.preferences.deleteConfirmationSkipAlways')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className='flex flex-col items-start gap-2.5 w-full'>
        <Label className='font-semibold'>{t('settings.preferences.target')}</Label>
        <Select
          value={startTarget}
          onValueChange={(v) => setStartTarget(v as StartTarget)}
        >
          <SelectTrigger className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='dashboard'>
              {t('settings.preferences.targetDashboard')}
            </SelectItem>
            <SelectItem value='lastUsedTable'>
              {t('settings.preferences.targetLastTable')}
            </SelectItem>
            <SelectItem value='project'>
              {t('settings.preferences.targetProject')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {startTarget === 'project' && (
        <div className='flex flex-col items-start gap-2.5 w-full'>
          <Label className='font-semibold'>{t('settings.preferences.targetProject')}</Label>
          <Select
            value={(startProjectId || allProjects[0]?.id) ?? ''}
            onValueChange={(v) => setStartProjectId(v)}
          >
            <SelectTrigger className='w-full'>
              <SelectValue placeholder='Select project…' />
            </SelectTrigger>
            <SelectContent>
              {allProjects.map((project) => (
                <SelectItem key={project.id} value={String(project.id)}>
                  <ProjectIcon name={project.icon} className='size-4 shrink-0' />
                  <span>{project.title}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className='flex flex-col items-start gap-2.5 w-full'>
        <Label className='font-semibold'>{t('settings.preferences.dateFormat')}</Label>
        <Select value={dateFormat} onValueChange={setDateFormat}>
          <SelectTrigger className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dateFormats.map((fmt) => (
              <SelectItem key={fmt} value={fmt}>
                {fmt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className='flex flex-col items-start gap-2.5 w-full'>
        <Label className='font-semibold'>{t('settings.preferences.timeFormat')}</Label>
        <Select value={timeFormat} onValueChange={(v) => setTimeFormat(v as '24h' | '12h')}>
          <SelectTrigger className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='24h'>24h</SelectItem>
            <SelectItem value='12h'>12h</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function RemoveAccountSettings() {
  const authCtx = useAuthContext();
  const { t } = useLanguage();
  const passwordRef = useRef<string>(undefined);
  const [deletingAccount, setDeletingAccount] = useState<boolean>(false);

  const deleteAccount = () => {
    if (!passwordRef.current) return;
    setDeletingAccount(true);
    authService
      .deleteCurrentUser({ password: passwordRef.current })
      .then((res) => {
        if (res?.status !== 200) {
          throw new Error('Error Deleting user account');
        }
        authCtx.methods.logout();
        setDeletingAccount(false);
        return null;
      })
      .catch((err) => {
        setDeletingAccount(false);
        toast.error(err.toString());
      });
  };

  return (
    <>
      <p>{t('settings.removeAccount.text')}</p>
      <div className='flex flex-col items-start gap-2.5 w-full'>
        <Label className='font-semibold'>{t('settings.password.placeholder')}</Label>
        <Input
          placeholder={t('settings.password.placeholder')}
          type='password'
          onChange={(evnt) => {
            passwordRef.current = evnt.target.value;
          }}
          disabled={deletingAccount}
        />
      </div>
      <Button
        onClick={deleteAccount}
        variant='destructive'
        className='self-end'
        disabled={deletingAccount}
      >
        {t('settings.removeAccount.submit')}
      </Button>
    </>
  );
}

function openUserSettingsDialog() {
  window.dispatchEvent(new CustomEvent(OPEN_USER_SETTINGS_DIALOG_EVENT));
}

export { UserSettingsDialog, openUserSettingsDialog };
